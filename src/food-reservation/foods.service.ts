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
import { CreateFoodDto } from './dto/create-food.dto';
import { FindFoodsQueryDto } from './dto/find-foods-query.dto';
import { UpdateFoodDto } from './dto/update-food.dto';

const foodSelect = {
  id: true,
  name: true,
  description: true,
  photoId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { menuItems: true } },
} satisfies Prisma.FoodSelect;

function optionalConnect(id: string | null | undefined) {
  if (id === undefined) return undefined;
  return id ? { connect: { id } } : { disconnect: true };
}

@Injectable()
export class FoodsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindFoodsQueryDto) {
    const where: Prisma.FoodWhereInput = {
      OR: query.q
        ? [
            { name: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.FoodOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        description: (dir) => ({ description: dir }),
        menuItemCount: (dir) => ({ menuItems: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.food.findMany({ where, orderBy, select: foodSelect });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.food.findMany({
        where,
        orderBy,
        skip,
        take,
        select: foodSelect,
      }),
      this.prisma.food.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const food = await this.prisma.food.findUnique({
      where: { id },
      select: foodSelect,
    });
    if (!food) {
      throw new NotFoundException('غذا یافت نشد');
    }
    return food;
  }

  async create(dto: CreateFoodDto) {
    await this.assertImage(dto.photoId);
    return this.prisma.food.create({
      data: {
        name: dto.name,
        description: dto.description,
        photoId: dto.photoId ?? null,
      },
      select: foodSelect,
    });
  }

  async update(id: string, dto: UpdateFoodDto) {
    await this.findOne(id);
    await this.assertImage(dto.photoId);
    return this.prisma.food.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        photo: optionalConnect(dto.photoId),
      },
      select: foodSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.restaurantMenuItem.count({
      where: { foodId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        'ابتدا این غذا را از برنامه غذایی رستوران‌ها حذف کنید',
      );
    }
    await this.prisma.food.delete({ where: { id } });
    return { ok: true };
  }

  private async assertImage(id?: string | null) {
    if (!id) return;
    const count = await this.prisma.storedImage.count({ where: { id } });
    if (!count) {
      throw new BadRequestException('تصویر معتبر نیست');
    }
  }
}
