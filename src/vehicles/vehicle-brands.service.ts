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
import { CreateVehicleBrandDto } from './dto/create-vehicle-brand.dto';
import { FindVehicleBrandsQueryDto } from './dto/find-vehicle-brands-query.dto';
import { UpdateVehicleBrandDto } from './dto/update-vehicle-brand.dto';

const brandSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { vehicles: true } },
} satisfies Prisma.VehicleBrandSelect;

@Injectable()
export class VehicleBrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindVehicleBrandsQueryDto) {
    const where: Prisma.VehicleBrandWhereInput = {
      OR: query.q ? [{ name: containsInsensitive(query.q) }] : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.VehicleBrandOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        vehicleCount: (dir) => ({ vehicles: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.vehicleBrand.findMany({
        where,
        orderBy,
        select: brandSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.vehicleBrand.findMany({
        where,
        orderBy,
        skip,
        take,
        select: brandSelect,
      }),
      this.prisma.vehicleBrand.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.vehicleBrand.findUnique({
      where: { id },
      select: brandSelect,
    });
    if (!item) {
      throw new NotFoundException('برند یافت نشد');
    }
    return item;
  }

  async create(dto: CreateVehicleBrandDto) {
    try {
      return await this.prisma.vehicleBrand.create({
        data: { name: dto.name },
        select: brandSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateVehicleBrandDto) {
    await this.findOne(id);
    try {
      return await this.prisma.vehicleBrand.update({
        where: { id },
        data: { name: dto.name },
        select: brandSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.vehicle.count({ where: { brandId: id } });
    if (used > 0) {
      throw new ConflictException('ابتدا وسایل این برند را تغییر دهید یا حذف کنید');
    }
    await this.prisma.vehicleBrand.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این برند قبلاً ثبت شده است');
    }
    throw error;
  }
}
