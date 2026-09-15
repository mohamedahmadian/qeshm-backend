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
import { CreateProjectGroupDto } from './dto/create-project-group.dto';
import { FindProjectGroupsQueryDto } from './dto/find-project-groups-query.dto';
import { UpdateProjectGroupDto } from './dto/update-project-group.dto';

const groupSelect = {
  id: true,
  name: true,
  description: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { projects: true } },
} satisfies Prisma.ProjectGroupSelect;

@Injectable()
export class ProjectGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindProjectGroupsQueryDto) {
    const where: Prisma.ProjectGroupWhereInput = {
      OR: query.q
        ? [
            { name: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ProjectGroupOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        description: (dir) => ({ description: dir }),
        projectCount: (dir) => ({ projects: { _count: dir } }),
      },
      [{ name: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.projectGroup.findMany({
        where,
        orderBy,
        select: groupSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectGroup.findMany({
        where,
        orderBy,
        skip,
        take,
        select: groupSelect,
      }),
      this.prisma.projectGroup.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const group = await this.prisma.projectGroup.findUnique({
      where: { id },
      select: groupSelect,
    });
    if (!group) {
      throw new NotFoundException('گروه یافت نشد');
    }
    return group;
  }

  async create(dto: CreateProjectGroupDto) {
    try {
      return await this.prisma.projectGroup.create({
        data: {
          name: dto.name,
          description: dto.description,
          color: dto.color ?? '#2ebdb6',
        },
        select: groupSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateProjectGroupDto) {
    await this.findOne(id);
    try {
      return await this.prisma.projectGroup.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          color: dto.color,
        },
        select: groupSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.project.count({ where: { groupId: id } });
    if (used > 0) {
      throw new ConflictException('ابتدا گروه پروژه‌های این مورد را تغییر دهید یا حذف کنید');
    }
    await this.prisma.projectGroup.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این نام گروه قبلاً ثبت شده است');
    }
    throw error;
  }
}
