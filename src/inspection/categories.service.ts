import {
  BadRequestException,
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
import { CreateInspectionCategoryDto } from './dto/create-category.dto';
import { FindInspectionCategoriesQueryDto } from './dto/find-categories-query.dto';
import { UpdateInspectionCategoryDto } from './dto/update-category.dto';

const categorySelect = {
  id: true,
  parentId: true,
  name: true,
  description: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  parent: { select: { id: true, name: true } },
  _count: { select: { children: true, feedbacks: true } },
} satisfies Prisma.InspectionCategorySelect;

@Injectable()
export class InspectionCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindInspectionCategoriesQueryDto) {
    const where: Prisma.InspectionCategoryWhereInput = {
      parentId: query.parentId,
      isActive: query.isActive,
      OR: query.q
        ? [
            { name: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
            { parent: { name: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.InspectionCategoryOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        sortOrder: (dir) => ({ sortOrder: dir }),
        isActive: (dir) => ({ isActive: dir }),
        parent: (dir) => ({ parent: { name: dir } }),
        childCount: (dir) => ({ children: { _count: dir } }),
        feedbackCount: (dir) => ({ feedbacks: { _count: dir } }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.inspectionCategory.findMany({
        where,
        orderBy,
        select: categorySelect,
      });
      return this.withPaths(items);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.inspectionCategory.findMany({
        where,
        orderBy,
        skip,
        take,
        select: categorySelect,
      }),
      this.prisma.inspectionCategory.count({ where }),
    ]);
    return paginatedResult(await this.withPaths(items), total, page, pageSize);
  }

  async tree(activeOnly = false) {
    const items = await this.prisma.inspectionCategory.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: categorySelect,
    });
    const withPath = await this.withPaths(items);
    const byParent = new Map<string | null, typeof withPath>();
    for (const item of withPath) {
      const key = item.parentId;
      const list = byParent.get(key) ?? [];
      list.push(item);
      byParent.set(key, list);
    }
    const nest = (parentId: string | null): (typeof withPath[number] & { children: unknown[] })[] =>
      (byParent.get(parentId) ?? []).map((item) => ({
        ...item,
        children: nest(item.id),
      }));
    return nest(null);
  }

  async findOne(id: string) {
    const category = await this.prisma.inspectionCategory.findUnique({
      where: { id },
      select: categorySelect,
    });
    if (!category) {
      throw new NotFoundException('دسته‌بندی پیدا نشد');
    }
    const [mapped] = await this.withPaths([category]);
    return mapped;
  }

  async create(dto: CreateInspectionCategoryDto) {
    if (dto.parentId) {
      await this.assertCategory(dto.parentId);
    }
    return this.prisma.inspectionCategory.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      select: categorySelect,
    });
  }

  async update(id: string, dto: UpdateInspectionCategoryDto) {
    await this.findOne(id);
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('دسته‌بندی نمی‌تواند والد خودش باشد');
      }
      await this.assertCategory(dto.parentId);
      if (await this.isDescendant(dto.parentId, id)) {
        throw new BadRequestException('نمی‌توان دسته را زیرمجموعهٔ فرزند خودش گذاشت');
      }
    }
    return this.prisma.inspectionCategory.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      select: categorySelect,
    });
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    if (category._count.children > 0) {
      throw new ConflictException('ابتدا زیردسته‌ها را حذف کنید');
    }
    if (category._count.feedbacks > 0) {
      throw new ConflictException('این دسته نظر ثبت‌شده دارد و قابل حذف نیست');
    }
    await this.prisma.inspectionCategory.delete({ where: { id } });
    return { ok: true };
  }

  private async assertCategory(id: string) {
    const found = await this.prisma.inspectionCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new BadRequestException('دسته‌بندی والد معتبر نیست');
    }
  }

  private async isDescendant(candidateId: string, ancestorId: string) {
    let current = await this.prisma.inspectionCategory.findUnique({
      where: { id: candidateId },
      select: { parentId: true },
    });
    const seen = new Set<string>();
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      if (seen.has(current.parentId)) break;
      seen.add(current.parentId);
      current = await this.prisma.inspectionCategory.findUnique({
        where: { id: current.parentId },
        select: { parentId: true },
      });
    }
    return false;
  }

  private async withPaths<
    T extends { id: string; parentId: string | null; name: string },
  >(items: T[]) {
    const all = await this.prisma.inspectionCategory.findMany({
      select: { id: true, parentId: true, name: true },
    });
    const byId = new Map(all.map((item) => [item.id, item]));
    return items.map((item) => ({
      ...item,
      path: this.buildPath(item.id, byId),
    }));
  }

  private buildPath(
    id: string,
    byId: Map<string, { id: string; parentId: string | null; name: string }>,
  ) {
    const parts: string[] = [];
    const seen = new Set<string>();
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return parts.join(' / ');
  }
}
