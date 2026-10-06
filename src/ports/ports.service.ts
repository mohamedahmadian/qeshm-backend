import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { STAKEHOLDERS_ADMIN_ROLE_CODE } from '../access/access.constants';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortDto, PortKindValue } from './dto/create-port.dto';
import { FindPortsQueryDto } from './dto/find-ports-query.dto';
import { UpdatePortDto } from './dto/update-port.dto';

const citySelect = {
  id: true,
  nameFa: true,
  nameEn: true,
} satisfies Prisma.CitySelect;

const portSelect = {
  id: true,
  name: true,
  cityId: true,
  city: { select: citySelect },
  cooperativeName: true,
  address: true,
  kind: true,
  managerName: true,
  phone: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PortSelect;

export type PortActor = {
  isAdmin?: boolean;
  roleCodes?: string[];
};

type PortRow = Prisma.PortGetPayload<{ select: typeof portSelect }>;

@Injectable()
export class PortsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor: PortActor | undefined, query: FindPortsQueryDto) {
    const where = searchWhere(query.q);
    const orderBy = resolveSortOrder<Prisma.PortOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        city: (dir) => ({ city: { nameFa: dir } }),
        cooperativeName: (dir) => ({ cooperativeName: dir }),
        kind: (dir) => ({ kind: dir }),
        managerName: (dir) => ({ managerName: dir }),
        phone: (dir) => ({ phone: dir }),
      },
      [{ name: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.port.findMany({
        where,
        orderBy,
        select: portSelect,
      });
      return items.map(serializePort);
    }
    assertCanManage(actor);
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.port.findMany({
        where,
        orderBy,
        skip,
        take,
        select: portSelect,
      }),
      this.prisma.port.count({ where }),
    ]);
    return paginatedResult(items.map(serializePort), total, page, pageSize);
  }

  async findOne(actor: PortActor | undefined, id: string) {
    assertCanManage(actor);
    const item = await this.prisma.port.findUnique({
      where: { id },
      select: portSelect,
    });
    if (!item) throw new NotFoundException('بندر یافت نشد');
    return serializePort(item);
  }

  async create(actor: PortActor | undefined, dto: CreatePortDto) {
    assertCanManage(actor);
    await this.assertCity(dto.cityId);
    assertCoordinates(dto.latitude, dto.longitude);
    try {
      const item = await this.prisma.port.create({
        data: toData(dto),
        select: portSelect,
      });
      return serializePort(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(actor: PortActor | undefined, id: string, dto: UpdatePortDto) {
    assertCanManage(actor);
    const current = await this.prisma.port.findUnique({
      where: { id },
      select: portSelect,
    });
    if (!current) throw new NotFoundException('بندر یافت نشد');
    const cityId = dto.cityId ?? current.cityId;
    await this.assertCity(cityId);
    const latitude = dto.latitude !== undefined ? dto.latitude : toNumber(current.latitude);
    const longitude = dto.longitude !== undefined ? dto.longitude : toNumber(current.longitude);
    assertCoordinates(latitude, longitude);
    try {
      const item = await this.prisma.port.update({
        where: { id },
        data: toData({
          name: dto.name ?? current.name,
          cityId,
          cooperativeName: dto.cooperativeName ?? current.cooperativeName,
          address: dto.address !== undefined ? dto.address : current.address,
          kind: (dto.kind ?? current.kind) as PortKindValue,
          managerName: dto.managerName ?? current.managerName,
          phone: dto.phone ?? current.phone,
          latitude,
          longitude,
        }),
        select: portSelect,
      });
      return serializePort(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(actor: PortActor | undefined, id: string) {
    assertCanManage(actor);
    const current = await this.prisma.port.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new NotFoundException('بندر یافت نشد');
    await this.prisma.port.delete({ where: { id } });
    return { ok: true };
  }

  private async assertCity(cityId: string) {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true },
    });
    if (!city) throw new NotFoundException('شهر یافت نشد');
  }

  private rethrowUnique(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('بندری با این نام قبلاً ثبت شده است');
    }
    throw error;
  }
}

function assertCanManage(actor?: PortActor) {
  if (actor?.isAdmin || actor?.roleCodes?.includes(STAKEHOLDERS_ADMIN_ROLE_CODE)) return;
  throw new ForbiddenException('فقط مدیریت و مدیر ماژول درگاه می‌توانند بنادر را مدیریت کنند');
}

function assertCoordinates(latitude?: number | null, longitude?: number | null) {
  const hasLat = latitude != null;
  const hasLng = longitude != null;
  if (hasLat === hasLng) return;
  throw new BadRequestException('عرض و طول جغرافیایی باید با هم ثبت شوند');
}

function toData(dto: CreatePortDto) {
  return {
    name: dto.name.trim(),
    cityId: dto.cityId,
    cooperativeName: dto.cooperativeName.trim(),
    address: dto.address?.trim() || null,
    kind: dto.kind,
    managerName: dto.managerName.trim(),
    phone: dto.phone.trim(),
    latitude: dto.latitude ?? null,
    longitude: dto.longitude ?? null,
  };
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function serializePort(item: PortRow) {
  return {
    ...item,
    latitude: toNumber(item.latitude),
    longitude: toNumber(item.longitude),
  };
}

function searchWhere(q?: string): Prisma.PortWhereInput {
  const trimmed = q?.trim();
  if (!trimmed) return {};
  return {
    OR: [
      { name: containsInsensitive(trimmed) },
      { cooperativeName: containsInsensitive(trimmed) },
      { managerName: containsInsensitive(trimmed) },
      { phone: containsInsensitive(trimmed) },
      { address: containsInsensitive(trimmed) },
      { city: { nameFa: containsInsensitive(trimmed) } },
      { city: { nameEn: containsInsensitive(trimmed) } },
    ],
  };
}
