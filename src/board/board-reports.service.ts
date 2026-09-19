import { Injectable } from '@nestjs/common';
import {
  addDaysIso,
  parseIsoDate,
  toIsoDateOnly,
  todayIsoDateTehran,
} from '../common/iso-date';
import { containsInsensitive } from '../common/pagination';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BoardMinutesService } from './board-minutes.service';
import { FindBoardReportsQueryDto } from './dto/find-board-reports-query.dto';

const IRAN_WEEKDAY_ORDER = [
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const;

type DueStatus = 'overdue' | 'today' | 'soon' | 'upcoming' | 'later' | 'noDue';

type UnitBucket = {
  id: string | null;
  name: string;
  count: number;
  overdue: number;
  soon: number;
  upcoming: number;
  later: number;
  noDue: number;
};

function emptyUnit(id: string | null, name: string): UnitBucket {
  return {
    id,
    name,
    count: 0,
    overdue: 0,
    soon: 0,
    upcoming: 0,
    later: 0,
    noDue: 0,
  };
}

function iranWeekdayKey(iso: string) {
  const utc = parseIsoDate(iso).getUTCDay();
  const keys = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;
  return keys[utc];
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

@Injectable()
export class BoardReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minutes: BoardMinutesService,
  ) {}

  async overview(query: FindBoardReportsQueryDto, userId: string) {
    await this.minutes.assertMinutesAccess(userId);
    const today = todayIsoDateTehran();
    const soonEnd = addDaysIso(today, 7);
    const upcomingEnd = addDaysIso(today, 30);

    const minutes = await this.prisma.boardMinutes.findMany({
      where: this.minutesWhere(query),
      select: {
        id: true,
        heldAt: true,
        requestId: true,
        request: { select: { unit: { select: { id: true, name: true } } } },
        members: { select: { attendance: true } },
        attachments: { select: { kind: true } },
        resolutions: {
          select: {
            id: true,
            unitId: true,
            dueDate: true,
            unit: { select: { id: true, name: true } },
          },
        },
      },
    });

    const byKind = { regular: 0, linked: 0 };
    const byDueStatus = new Map<DueStatus, number>([
      ['overdue', 0],
      ['today', 0],
      ['soon', 0],
      ['upcoming', 0],
      ['later', 0],
      ['noDue', 0],
    ]);
    const byWeekday = new Map<string, number>(
      IRAN_WEEKDAY_ORDER.map((key) => [key, 0]),
    );
    const byMonth = new Map<string, { minutes: number; resolutions: number }>();
    const byUnit = new Map<string, UnitBucket>();
    const byRequestUnit = new Map<string, { id: string; name: string; count: number }>();

    let totalResolutions = 0;
    let withDueDate = 0;
    let withoutDueDate = 0;
    let withoutUnit = 0;
    let presentCount = 0;
    let absentCount = 0;
    let meetingsWithResolutions = 0;
    let meetingsWithAttachments = 0;
    let meetingsWithMembers = 0;
    let imageAttachments = 0;
    let audioAttachments = 0;
    let dueLeadDays = 0;
    let dueLeadCount = 0;

    for (const item of minutes) {
      const heldAt = toIsoDateOnly(item.heldAt) ?? today;
      if (item.requestId) byKind.linked += 1;
      else byKind.regular += 1;

      const weekday = iranWeekdayKey(heldAt);
      byWeekday.set(weekday, (byWeekday.get(weekday) ?? 0) + 1);

      const month = heldAt.slice(0, 7);
      const monthBucket = byMonth.get(month) ?? { minutes: 0, resolutions: 0 };
      monthBucket.minutes += 1;

      if (item.members.length > 0) meetingsWithMembers += 1;
      if (item.attachments.length > 0) meetingsWithAttachments += 1;
      for (const member of item.members) {
        if (member.attendance === 'PRESENT') presentCount += 1;
        else absentCount += 1;
      }
      for (const attachment of item.attachments) {
        if (attachment.kind === 'IMAGE') imageAttachments += 1;
        else audioAttachments += 1;
      }

      if (item.request?.unit) {
        const unit = item.request.unit;
        const bucket = byRequestUnit.get(unit.id) ?? {
          id: unit.id,
          name: unit.name,
          count: 0,
        };
        bucket.count += 1;
        byRequestUnit.set(unit.id, bucket);
      }

      const resolutions = query.unitId
        ? item.resolutions.filter((row) => row.unitId === query.unitId)
        : item.resolutions;
      if (resolutions.length > 0) meetingsWithResolutions += 1;
      monthBucket.resolutions += resolutions.length;
      byMonth.set(month, monthBucket);

      for (const resolution of resolutions) {
        totalResolutions += 1;
        const due = toIsoDateOnly(resolution.dueDate);
        const status = this.dueStatus(due, today, soonEnd, upcomingEnd);
        byDueStatus.set(status, (byDueStatus.get(status) ?? 0) + 1);
        if (due) {
          withDueDate += 1;
          const lead = daysBetween(heldAt, due);
          if (lead != null) {
            dueLeadDays += lead;
            dueLeadCount += 1;
          }
        } else {
          withoutDueDate += 1;
        }
        if (!resolution.unitId) withoutUnit += 1;

        const unitKey = resolution.unitId ?? '';
        const bucket =
          byUnit.get(unitKey) ?? emptyUnit(resolution.unitId, resolution.unit?.name ?? '');
        bucket.count += 1;
        if (status === 'overdue') bucket.overdue += 1;
        else if (status === 'today' || status === 'soon') bucket.soon += 1;
        else if (status === 'upcoming') bucket.upcoming += 1;
        else if (status === 'later') bucket.later += 1;
        else bucket.noDue += 1;
        byUnit.set(unitKey, bucket);
      }
    }

    const totalMinutes = minutes.length;
    const attendanceTotal = presentCount + absentCount;
    const topUnit = [...byUnit.values()]
      .filter((item) => item.id)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa'))[0];

    return {
      kpis: {
        totalMinutes,
        linkedMinutes: byKind.linked,
        regularMinutes: byKind.regular,
        totalResolutions,
        withDueDate,
        withoutDueDate,
        overdue: byDueStatus.get('overdue') ?? 0,
        dueToday: byDueStatus.get('today') ?? 0,
        dueSoon: byDueStatus.get('soon') ?? 0,
        upcoming: byDueStatus.get('upcoming') ?? 0,
        later: byDueStatus.get('later') ?? 0,
        withoutUnit,
        withUnit: totalResolutions - withoutUnit,
        meetingsWithResolutions,
        meetingsWithoutResolutions: totalMinutes - meetingsWithResolutions,
        meetingsWithAttachments,
        meetingsWithMembers,
        imageAttachments,
        audioAttachments,
        presentCount,
        absentCount,
        attendanceRate: this.avg(presentCount * 100, attendanceTotal),
        avgResolutionsPerMeeting: this.avg(totalResolutions, totalMinutes),
        avgMembersPerMeeting: this.avg(presentCount + absentCount, totalMinutes),
        avgDueLeadDays: this.avg(dueLeadDays, dueLeadCount),
        topUnit: topUnit?.name ?? null,
        topUnitCount: topUnit?.count ?? 0,
      },
      byKind: [
        { key: 'regular', count: byKind.regular },
        { key: 'linked', count: byKind.linked },
      ],
      byDueStatus: (
        ['overdue', 'today', 'soon', 'upcoming', 'later', 'noDue'] as DueStatus[]
      ).map((key) => ({ key, count: byDueStatus.get(key) ?? 0 })),
      byAttendance: [
        { key: 'PRESENT', count: presentCount },
        { key: 'ABSENT', count: absentCount },
      ],
      byCoverage: [
        { key: 'with', count: meetingsWithResolutions },
        { key: 'without', count: totalMinutes - meetingsWithResolutions },
      ],
      byAttachment: [
        { key: 'image', count: imageAttachments },
        { key: 'audio', count: audioAttachments },
      ],
      byWeekday: IRAN_WEEKDAY_ORDER.map((key) => ({
        key,
        count: byWeekday.get(key) ?? 0,
      })),
      byMonth: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, item]) => ({ month, ...item })),
      byUnit: [...byUnit.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa'),
      ),
      byRequestUnit: [...byRequestUnit.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa'),
      ),
    };
  }

  private minutesWhere(query: FindBoardReportsQueryDto): Prisma.BoardMinutesWhereInput {
    const heldAt =
      query.from || query.to
        ? {
            ...(query.from ? { gte: parseIsoDate(query.from) } : {}),
            ...(query.to ? { lte: parseIsoDate(query.to) } : {}),
          }
        : undefined;
    return {
      ...(heldAt ? { heldAt } : {}),
      ...(query.kind === 'regular'
        ? { requestId: null }
        : query.kind === 'linked'
          ? { requestId: { not: null } }
          : {}),
      OR: query.q
        ? [
            { subject: containsInsensitive(query.q) },
            { body: containsInsensitive(query.q) },
            { request: { subject: containsInsensitive(query.q) } },
            { createdBy: { fullName: containsInsensitive(query.q) } },
            { resolutions: { some: { title: containsInsensitive(query.q) } } },
            { resolutions: { some: { description: containsInsensitive(query.q) } } },
          ]
        : undefined,
    };
  }

  private dueStatus(
    due: string | null,
    today: string,
    soonEnd: string,
    upcomingEnd: string,
  ): DueStatus {
    if (!due) return 'noDue';
    if (due < today) return 'overdue';
    if (due === today) return 'today';
    if (due <= soonEnd) return 'soon';
    if (due <= upcomingEnd) return 'upcoming';
    return 'later';
  }

  private avg(total: number, count: number) {
    if (count <= 0) return 0;
    return Math.round((total / count) * 10) / 10;
  }
}
