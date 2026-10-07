import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  STAKEHOLDERS_ADMIN_ROLE_CODE,
  TAAVONI_BELIT_ROLE_CODE,
} from '../access/access.constants';
import { toLatinDigits } from '../common/national-id';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { joinFullName } from '../users/user-profile.util';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortDto, CreatePortOperatorDto, PortKindValue } from './dto/create-port.dto';
import { FindPortsQueryDto } from './dto/find-ports-query.dto';
import { UpdatePortDto } from './dto/update-port.dto';

const citySelect = {
  id: true,
  nameFa: true,
  nameEn: true,
} satisfies Prisma.CitySelect;

const operatorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  fullName: true,
  phone: true,
} satisfies Prisma.UserSelect;

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

const portDetailSelect = {
  ...portSelect,
  securityToken: true,
  operatorUserId: true,
  operatorUser: { select: operatorSelect },
} satisfies Prisma.PortSelect;

export type PortActor = {
  isAdmin?: boolean;
  roleCodes?: string[];
};

type PortRow = Prisma.PortGetPayload<{ select: typeof portSelect }>;
type PortDetailRow = Prisma.PortGetPayload<{ select: typeof portDetailSelect }>;
type PortTx = Prisma.TransactionClient;

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

  async findOperators(actor: PortActor | undefined) {
    assertCanManage(actor);
    const items = await this.prisma.user.findMany({
      where: {
        userRoles: { some: { role: { code: TAAVONI_BELIT_ROLE_CODE } } },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: {
        ...operatorSelect,
        operatedPort: { select: { id: true, name: true } },
      },
    });
    return items.map((item) => ({
      id: item.id,
      firstName: item.firstName,
      lastName: item.lastName,
      fullName: item.fullName,
      phone: item.phone,
      port: item.operatedPort,
    }));
  }

  async findOne(actor: PortActor | undefined, id: string) {
    assertCanManage(actor);
    const item = await this.prisma.port.findUnique({
      where: { id },
      select: portDetailSelect,
    });
    if (!item) throw new NotFoundException('بندر یافت نشد');
    return serializePort(item);
  }

  async create(actor: PortActor | undefined, dto: CreatePortDto) {
    assertCanManage(actor);
    await this.assertCity(dto.cityId);
    assertCoordinates(dto.latitude, dto.longitude);
    try {
      const item = await this.prisma.$transaction(async (tx) => {
        const operatorUserId = await this.resolveOperatorId(tx, dto);
        return tx.port.create({
          data: {
            ...toData(dto),
            securityToken: dto.securityToken?.trim() || createPortSecurityToken(),
            operatorUserId,
          },
          select: portDetailSelect,
        });
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
      select: portDetailSelect,
    });
    if (!current) throw new NotFoundException('بندر یافت نشد');
    const cityId = dto.cityId ?? current.cityId;
    await this.assertCity(cityId);
    const latitude = dto.latitude !== undefined ? dto.latitude : toNumber(current.latitude);
    const longitude = dto.longitude !== undefined ? dto.longitude : toNumber(current.longitude);
    assertCoordinates(latitude, longitude);
    try {
      const item = await this.prisma.$transaction(async (tx) => {
        const operatorUserId = await this.resolveOperatorId(tx, dto, id, current.operatorUserId);
        return tx.port.update({
          where: { id },
          data: {
            ...toData({
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
            securityToken: dto.securityToken?.trim() || current.securityToken,
            operatorUserId,
          },
          select: portDetailSelect,
        });
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

  private async resolveOperatorId(
    tx: PortTx,
    dto: { operatorUserId?: string | null; newOperator?: CreatePortOperatorDto },
    portId?: string,
    fallback: string | null = null,
  ) {
    if (dto.newOperator) {
      const created = await this.createOperator(tx, dto.newOperator);
      return created.id;
    }
    if (dto.operatorUserId !== undefined) {
      if (dto.operatorUserId) await this.assertOperator(tx, dto.operatorUserId, portId);
      return dto.operatorUserId;
    }
    return fallback;
  }

  private async assertOperator(tx: PortTx, userId: string, portId?: string) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userRoles: { select: { role: { select: { code: true } } } },
        operatedPort: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    const hasRole = user.userRoles.some((item) => item.role.code === TAAVONI_BELIT_ROLE_CODE);
    if (!hasRole) throw new BadRequestException('این کاربر نقش تعاونی بلیت ندارد');
    if (user.operatedPort && user.operatedPort.id !== portId) {
      throw new ConflictException(`این کاربر به بندر ${user.operatedPort.name} اختصاص دارد`);
    }
  }

  private async createOperator(tx: PortTx, dto: CreatePortOperatorDto) {
    const phone = dto.phone;
    const taken = await tx.user.findFirst({
      where: { OR: [{ phone }, { username: phone }] },
      select: { id: true },
    });
    if (taken) throw new ConflictException('این تلفن همراه قبلاً ثبت شده است');
    const role = await tx.role.findUnique({
      where: { code: TAAVONI_BELIT_ROLE_CODE },
      select: { id: true },
    });
    if (!role) throw new BadRequestException('نقش تعاونی بلیت در سامانه تعریف نشده است');
    const passwordHash = await bcrypt.hash(toLatinDigits(dto.password), 10);
    return tx.user.create({
      data: {
        username: phone,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        fullName: joinFullName(dto.firstName, dto.lastName),
        phone,
        locale: 'fa',
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: role.id } },
      },
      select: { id: true },
    });
  }

  private rethrowUnique(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = JSON.stringify(error.meta?.target ?? '');
      if (target.includes('securityToken')) {
        throw new ConflictException('این توکن امنیتی قبلاً ثبت شده است');
      }
      if (target.includes('operatorUserId')) {
        throw new ConflictException('این کاربر به بندر دیگری اختصاص دارد');
      }
      if (target.includes('phone') || target.includes('username')) {
        throw new ConflictException('این تلفن همراه قبلاً ثبت شده است');
      }
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

function createPortSecurityToken() {
  return randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function serializePort(item: PortRow | PortDetailRow) {
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
