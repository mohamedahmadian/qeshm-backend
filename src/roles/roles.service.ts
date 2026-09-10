import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_ROLE_CODE } from '../access/access.constants';
import { isKnownPermissionCode } from '../access/permissions-catalog';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { FindRolesQueryDto } from './dto/find-roles-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { code: true }, orderBy: { code: 'asc' as const } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

function mapRole<
  T extends {
    permissions: { code: string }[];
  },
>(role: T) {
  const { permissions, ...rest } = role;
  return {
    ...rest,
    permissionCodes: permissions.map((item) => item.code),
  };
}

function assertPermissionCodes(codes: string[] | undefined) {
  if (!codes?.length) return [];
  const unique = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
  const unknown = unique.filter((code) => !isKnownPermissionCode(code));
  if (unknown.length) {
    throw new BadRequestException('مجوز انتخاب‌شده معتبر نیست');
  }
  return unique;
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindRolesQueryDto) {
    const q = query.q?.trim();
    const where: Prisma.RoleWhereInput = q
      ? {
          OR: [
            { name: containsInsensitive(q) },
            { code: containsInsensitive(q) },
            { description: containsInsensitive(q) },
          ],
        }
      : {};
    const orderBy = resolveSortOrder<Prisma.RoleOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        code: (dir) => ({ code: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
        userCount: (dir) => ({ users: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.role.findMany({
        where,
        orderBy,
        select: roleSelect,
      });
      return items.map(mapRole);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        orderBy,
        skip,
        take,
        select: roleSelect,
      }),
      this.prisma.role.count({ where }),
    ]);
    return paginatedResult(items.map(mapRole), total, page, pageSize);
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: roleSelect,
    });
    if (!role) {
      throw new NotFoundException('نقش یافت نشد');
    }
    return mapRole(role);
  }

  async create(dto: CreateRoleDto) {
    const code = dto.code.trim().toUpperCase();
    if (code === ADMIN_ROLE_CODE) {
      throw new BadRequestException('این کد نقش برای نقش سیستمی رزرو شده است');
    }
    await this.assertUniqueCode(code);
    const permissionCodes = assertPermissionCodes(dto.permissionCodes);
    const role = await this.prisma.role.create({
      data: {
        name: dto.name.trim(),
        code,
        description: dto.description?.trim() || null,
        permissions: {
          create: permissionCodes.map((item) => ({ code: item })),
        },
      },
      select: roleSelect,
    });
    return mapRole(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const current = await this.findOne(id);
    if (dto.code && dto.code.trim().toUpperCase() !== current.code) {
      if (current.isSystem) {
        throw new ForbiddenException('کد نقش سیستمی قابل تغییر نیست');
      }
      await this.assertUniqueCode(dto.code.trim().toUpperCase(), id);
    }
    const permissionCodes =
      current.isSystem || current.code === ADMIN_ROLE_CODE
        ? undefined
        : dto.permissionCodes !== undefined
          ? assertPermissionCodes(dto.permissionCodes)
          : undefined;
    const role = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        code:
          current.isSystem || !dto.code
            ? undefined
            : dto.code.trim().toUpperCase(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description.trim() || null,
        ...(permissionCodes
          ? {
              permissions: {
                deleteMany: {},
                create: permissionCodes.map((code) => ({ code })),
              },
            }
          : {}),
      },
      select: roleSelect,
    });
    return mapRole(role);
  }

  async remove(id: string) {
    const role = await this.findOne(id);
    if (role.isSystem || role.code === ADMIN_ROLE_CODE) {
      throw new ForbiddenException('نقش سیستمی را نمی‌توان حذف کرد');
    }
    if (role._count.users > 0) {
      throw new ConflictException(
        'ابتدا این نقش را از کاربران بردارید و بعد حذف کنید',
      );
    }
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  private async assertUniqueCode(code: string, excludeId?: string) {
    const existing = await this.prisma.role.findFirst({
      where: {
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('این کد نقش قبلاً ثبت شده است');
    }
  }
}
