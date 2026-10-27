import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSingardKindDto } from './dto/create-kind.dto';
import { FindSingardKindsQueryDto } from './dto/find-kinds-query.dto';
import { UpdateSingardKindDto } from './dto/update-kind.dto';

const kindSelect = {
  id: true,
  title: true,
  description: true,
  icon: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { feedbacks: true } },
} satisfies Prisma.SingardKindSelect;

@Injectable()
export class SingardKindsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindSingardKindsQueryDto) {
    const where: Prisma.SingardKindWhereInput = {
      isActive: query.isActive,
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.SingardKindOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        icon: (dir) => ({ icon: dir }),
        sortOrder: (dir) => ({ sortOrder: dir }),
        isActive: (dir) => ({ isActive: dir }),
        feedbackCount: (dir) => ({ feedbacks: { _count: dir } }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ sortOrder: 'asc' }, { title: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.singardKind.findMany({
        where,
        orderBy,
        select: kindSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.singardKind.findMany({
        where,
        orderBy,
        skip,
        take,
        select: kindSelect,
      }),
      this.prisma.singardKind.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findActive() {
    return this.prisma.singardKind.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: kindSelect,
    });
  }

  async findOne(id: string) {
    const kind = await this.prisma.singardKind.findUnique({
      where: { id },
      select: kindSelect,
    });
    if (!kind) {
      throw new NotFoundException('نوع پیام پیدا نشد');
    }
    return kind;
  }

  async create(dto: CreateSingardKindDto) {
    return this.prisma.singardKind.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      select: kindSelect,
    });
  }

  async update(id: string, dto: UpdateSingardKindDto) {
    await this.findOne(id);
    return this.prisma.singardKind.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        icon: dto.icon,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      select: kindSelect,
    });
  }

  async remove(id: string) {
    const kind = await this.findOne(id);
    if (kind._count.feedbacks > 0) {
      throw new ConflictException('این نوع پیام نظر ثبت‌شده دارد و قابل حذف نیست');
    }
    await this.prisma.singardKind.delete({ where: { id } });
    return { ok: true };
  }
}
