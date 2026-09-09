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
import { CreateOrganizationPositionDto } from './dto/create-organization-position.dto';
import { FindOrganizationPositionsQueryDto } from './dto/find-organization-positions-query.dto';
import { UpdateOrganizationPositionDto } from './dto/update-organization-position.dto';

const positionSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: true } },
} satisfies Prisma.OrganizationPositionSelect;

@Injectable()
export class OrganizationPositionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindOrganizationPositionsQueryDto) {
    const where: Prisma.OrganizationPositionWhereInput = {
      OR: query.q ? [{ name: containsInsensitive(query.q) }] : undefined,
    };
    const orderBy =
      resolveSortOrder<Prisma.OrganizationPositionOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          name: (dir) => ({ name: dir }),
          employeeCount: (dir) => ({ users: { _count: dir } }),
        },
        [{ createdAt: 'desc' }, { id: 'asc' }],
      );
    if (!wantsPagination(query)) {
      return this.prisma.organizationPosition.findMany({
        where,
        orderBy,
        select: positionSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.organizationPosition.findMany({
        where,
        orderBy,
        skip,
        take,
        select: positionSelect,
      }),
      this.prisma.organizationPosition.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const position = await this.prisma.organizationPosition.findUnique({
      where: { id },
      select: positionSelect,
    });
    if (!position) {
      throw new NotFoundException('سمت یافت نشد');
    }
    return position;
  }

  async create(dto: CreateOrganizationPositionDto) {
    try {
      return await this.prisma.organizationPosition.create({
        data: { name: dto.name },
        select: positionSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateOrganizationPositionDto) {
    await this.findOne(id);
    try {
      return await this.prisma.organizationPosition.update({
        where: { id },
        data: { name: dto.name },
        select: positionSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.user.count({ where: { positionId: id } });
    if (used > 0) {
      throw new ConflictException('ابتدا این سمت را از کارمندان بردارید');
    }
    await this.prisma.organizationPosition.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این سمت قبلاً ثبت شده است');
    }
    throw error;
  }
}
