import { BadRequestException, Injectable } from '@nestjs/common';
import { toIsoDateOnly, todayIsoDateTehran } from '../common/iso-date';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeNationalId } from '../common/national-id';
import { CooperativeInquiryQueryDto } from './dto/cooperative-inquiry-query.dto';
import {
  COOPERATIVE_SYNC_PAGE_MAX,
  CooperativeChangesQueryDto,
  CooperativeFullQueryDto,
} from './dto/cooperative-sync-query.dto';
import { cooperativeOk } from './cooperative-response';

const personSelect = {
  id: true,
  nationalId: true,
  firstName: true,
  lastName: true,
  qeshmondiEndDate: true,
} as const;

@Injectable()
export class CooperativeSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async inquiry(query: CooperativeInquiryQueryDto) {
    const nationalId = normalizeNationalId(query.nationalId);
    const user = await this.prisma.user.findUnique({
      where: { nationalId },
      select: { ...personSelect, isQeshmondi: true, individualTicketQuota: true },
    });
    if (!user?.isQeshmondi) {
      return cooperativeOk({ nationalId, isQeshmvand: false });
    }
    return cooperativeOk({
      ...mapPerson(user),
      individualTicketQuota: user.individualTicketQuota,
    });
  }

  async status() {
    const row = await this.prisma.qeshmondiFeedEvent.aggregate({
      _max: { seq: true },
    });
    return cooperativeOk({ latest: toSeq(row._max.seq) });
  }

  async full(query: CooperativeFullQueryDto) {
    const limit = query.limit ?? COOPERATIVE_SYNC_PAGE_MAX;
    const rows = await this.prisma.user.findMany({
      where: {
        isQeshmondi: true,
        ...(query.afterId ? { id: { gt: query.afterId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: personSelect,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapPerson);
    return cooperativeOk({
      items,
      nextAfterId: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    });
  }

  async changes(query: CooperativeChangesQueryDto) {
    if (query.to < query.from) {
      throw new BadRequestException('شروع بازه باید کوچک‌تر یا مساوی پایان باشد');
    }
    const size = query.to - query.from + 1;
    if (size > COOPERATIVE_SYNC_PAGE_MAX) {
      throw new BadRequestException('بازهٔ تغییرات حداکثر ۵۰۰ رکورد است');
    }
    const latest = (await this.status()).data?.latest ?? 0;
    const rows = await this.prisma.qeshmondiFeedEvent.findMany({
      where: {
        seq: { gte: BigInt(query.from), lte: BigInt(query.to) },
      },
      orderBy: { seq: 'asc' },
      select: {
        seq: true,
        userId: true,
        nationalId: true,
        firstName: true,
        lastName: true,
        qeshmondiEndDate: true,
      },
    });
    return cooperativeOk({
      from: query.from,
      to: query.to,
      latest,
      items: rows.map((row) => ({
        seq: toSeq(row.seq),
        ...mapPerson({
          id: row.userId,
          nationalId: row.nationalId,
          firstName: row.firstName,
          lastName: row.lastName,
          qeshmondiEndDate: row.qeshmondiEndDate,
        }),
      })),
    });
  }
}

function mapPerson(row: {
  id: string;
  nationalId: string | null;
  firstName: string;
  lastName: string;
  qeshmondiEndDate: Date | null;
}) {
  const qeshmondiEndDate = toIsoDateOnly(row.qeshmondiEndDate);
  return {
    id: row.id,
    nationalId: row.nationalId,
    firstName: row.firstName,
    lastName: row.lastName,
    qeshmondiEndDate,
    isQeshmvand: qeshmondiEndDate == null || qeshmondiEndDate >= todayIsoDateTehran(),
  };
}

function toSeq(value: bigint | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

