import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { STAKEHOLDERS_ADMIN_ROLE_CODE } from '../access/access.constants';
import { toLatinDigits } from '../common/national-id';
import { paginatedResult, paginationArgs, wantsPagination } from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketTariffDto } from './dto/create-ticket-tariff.dto';
import { FindTicketTariffsQueryDto } from './dto/find-ticket-tariffs-query.dto';
import { UpdateTicketTariffDto } from './dto/update-ticket-tariff.dto';

const tariffSelect = {
  id: true,
  year: true,
  individualPrice: true,
  individualQeshmondiPrice: true,
  individualSubsidy: true,
  vehiclePrice: true,
  vehicleQeshmondiPrice: true,
  vehicleSubsidy: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TicketTariffSelect;

export type TicketTariffActor = {
  isAdmin?: boolean;
  roleCodes?: string[];
};

type TariffPrices = {
  year: number;
  individualPrice: number;
  individualQeshmondiPrice: number;
  vehiclePrice: number;
  vehicleQeshmondiPrice: number;
};

@Injectable()
export class TicketTariffsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindTicketTariffsQueryDto) {
    const where = yearWhere(query.q);
    const orderBy = resolveSortOrder<Prisma.TicketTariffOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        year: (dir) => ({ year: dir }),
        individualPrice: (dir) => ({ individualPrice: dir }),
        individualQeshmondiPrice: (dir) => ({ individualQeshmondiPrice: dir }),
        individualSubsidy: (dir) => ({ individualSubsidy: dir }),
        vehiclePrice: (dir) => ({ vehiclePrice: dir }),
        vehicleQeshmondiPrice: (dir) => ({ vehicleQeshmondiPrice: dir }),
        vehicleSubsidy: (dir) => ({ vehicleSubsidy: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.ticketTariff.findMany({
        where,
        orderBy,
        select: tariffSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.ticketTariff.findMany({
        where,
        orderBy,
        skip,
        take,
        select: tariffSelect,
      }),
      this.prisma.ticketTariff.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.ticketTariff.findUnique({
      where: { id },
      select: tariffSelect,
    });
    if (!item) {
      throw new NotFoundException('تعرفه بلیط یافت نشد');
    }
    return item;
  }

  async create(actor: TicketTariffActor | undefined, dto: CreateTicketTariffDto) {
    assertCanEdit(actor);
    const data = toData(dto);
    try {
      return await this.prisma.ticketTariff.create({
        data,
        select: tariffSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(actor: TicketTariffActor | undefined, id: string, dto: UpdateTicketTariffDto) {
    assertCanEdit(actor);
    const current = await this.findOne(id);
    const data = toData({
      year: dto.year ?? current.year,
      individualPrice: dto.individualPrice ?? current.individualPrice,
      individualQeshmondiPrice:
        dto.individualQeshmondiPrice ?? current.individualQeshmondiPrice,
      vehiclePrice: dto.vehiclePrice ?? current.vehiclePrice,
      vehicleQeshmondiPrice: dto.vehicleQeshmondiPrice ?? current.vehicleQeshmondiPrice,
    });
    try {
      return await this.prisma.ticketTariff.update({
        where: { id },
        data,
        select: tariffSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(actor: TicketTariffActor | undefined, id: string) {
    assertCanEdit(actor);
    await this.findOne(id);
    await this.prisma.ticketTariff.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('تعرفه این سال قبلاً ثبت شده است');
    }
    throw error;
  }
}

function assertCanEdit(actor?: TicketTariffActor) {
  if (actor?.isAdmin || actor?.roleCodes?.includes(STAKEHOLDERS_ADMIN_ROLE_CODE)) return;
  throw new ForbiddenException('فقط مدیریت و مدیر ماژول درگاه می‌توانند تعرفه را ویرایش کنند');
}

function toData(prices: TariffPrices) {
  if (prices.individualQeshmondiPrice > prices.individualPrice) {
    throw new BadRequestException(
      'قیمت بلیط فردی قشموندی نمی‌تواند از قیمت بلیط فردی عادی بیشتر باشد',
    );
  }
  if (prices.vehicleQeshmondiPrice > prices.vehiclePrice) {
    throw new BadRequestException(
      'قیمت بلیط خودرویی قشموندی نمی‌تواند از قیمت بلیط خودرویی بیشتر باشد',
    );
  }
  return {
    year: prices.year,
    individualPrice: prices.individualPrice,
    individualQeshmondiPrice: prices.individualQeshmondiPrice,
    individualSubsidy: prices.individualPrice - prices.individualQeshmondiPrice,
    vehiclePrice: prices.vehiclePrice,
    vehicleQeshmondiPrice: prices.vehicleQeshmondiPrice,
    vehicleSubsidy: prices.vehiclePrice - prices.vehicleQeshmondiPrice,
  };
}

function yearWhere(q?: string): Prisma.TicketTariffWhereInput {
  const trimmed = q?.trim();
  if (!trimmed) return {};
  const digits = toLatinDigits(trimmed).replace(/\D/g, '');
  if (!digits || digits.length > 4) {
    return { year: { equals: -1 } };
  }
  return {
    year: {
      gte: Number(digits.padEnd(4, '0')),
      lte: Number(digits.padEnd(4, '9')),
    },
  };
}
