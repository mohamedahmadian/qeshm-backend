import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationUnitKindDto } from './dto/create-organization-unit-kind.dto';
import { FindOrganizationUnitKindsQueryDto } from './dto/find-organization-unit-kinds-query.dto';
import { UpdateOrganizationUnitKindDto } from './dto/update-organization-unit-kind.dto';

const kindSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { units: true } },
} satisfies Prisma.OrganizationUnitKindSelect;

@Injectable()
export class OrganizationUnitKindsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindOrganizationUnitKindsQueryDto) {
    const where: Prisma.OrganizationUnitKindWhereInput = {
      OR: query.q ? [{ name: containsInsensitive(query.q) }] : undefined,
    };
    const orderBy =
      resolveSortOrder<Prisma.OrganizationUnitKindOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          name: (dir) => ({ name: dir }),
          unitCount: (dir) => ({ units: { _count: dir } }),
        },
        [{ name: 'asc' }, { id: 'asc' }],
      );
    if (!wantsPagination(query)) {
      return this.prisma.organizationUnitKind.findMany({
        where,
        orderBy,
        select: kindSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.organizationUnitKind.findMany({
        where,
        orderBy,
        skip,
        take,
        select: kindSelect,
      }),
      this.prisma.organizationUnitKind.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const kind = await this.prisma.organizationUnitKind.findUnique({
      where: { id },
      select: kindSelect,
    });
    if (!kind) {
      throw new NotFoundException('نوع واحد یافت نشد');
    }
    return kind;
  }

  async create(dto: CreateOrganizationUnitKindDto) {
    try {
      return await this.prisma.organizationUnitKind.create({
        data: { name: dto.name },
        select: kindSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateOrganizationUnitKindDto) {
    await this.findOne(id);
    try {
      return await this.prisma.organizationUnitKind.update({
        where: { id },
        data: { name: dto.name },
        select: kindSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.organizationUnit.count({
      where: { kindId: id },
    });
    if (used > 0) {
      throw new ConflictException('ابتدا واحدهای این نوع را تغییر دهید یا حذف کنید');
    }
    await this.prisma.organizationUnitKind.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این نوع واحد قبلاً ثبت شده است');
    }
    throw error;
  }
}
