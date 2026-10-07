import { BadRequestException, Injectable } from '@nestjs/common';
import { toIsoDateOnly } from '../common/iso-date';
import { PrismaService } from '../prisma/prisma.service';
import {
  COOPERATIVE_SYNC_PAGE_MAX,
  CooperativeChangesQueryDto,
  CooperativeFullQueryDto,
} from './dto/cooperative-sync-query.dto';

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

  async status() {
    const row = await this.prisma.qeshmondiFeedEvent.aggregate({
      _max: { seq: true },
    });
    return { latest: toSeq(row._max.seq) };
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
    return {
      items,
      nextAfterId: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  async changes(query: CooperativeChangesQueryDto) {
    if (query.to < query.from) {
      throw new BadRequestException('شروع بازه باید کوچک‌تر یا مساوی پایان باشد');
    }
    const size = query.to - query.from + 1;
    if (size > COOPERATIVE_SYNC_PAGE_MAX) {
      throw new BadRequestException('بازهٔ تغییرات حداکثر ۵۰۰ رکورد است');
    }
    const latest = (await this.status()).latest;
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
    return {
      from: query.from,
      to: query.to,
      latest,
      items: rows.map((row) => ({
        seq: toSeq(row.seq),
        id: row.userId,
        nationalId: row.nationalId,
        firstName: row.firstName,
        lastName: row.lastName,
        qeshmondiEndDate: toIsoDateOnly(row.qeshmondiEndDate),
      })),
    };
  }
}

function mapPerson(row: {
  id: string;
  nationalId: string | null;
  firstName: string;
  lastName: string;
  qeshmondiEndDate: Date | null;
}) {
  return {
    id: row.id,
    nationalId: row.nationalId,
    firstName: row.firstName,
    lastName: row.lastName,
    qeshmondiEndDate: toIsoDateOnly(row.qeshmondiEndDate),
  };
}

function toSeq(value: bigint | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}
