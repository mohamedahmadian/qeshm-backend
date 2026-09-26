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
import { CreateContractorTypeDto } from './dto/create-contractor-type.dto';
import { FindContractorTypesQueryDto } from './dto/find-contractor-types-query.dto';
import { UpdateContractorTypeDto } from './dto/update-contractor-type.dto';

const typeSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { contractors: true } },
} satisfies Prisma.ProjectContractorTypeSelect;

@Injectable()
export class ContractorTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindContractorTypesQueryDto) {
    const where: Prisma.ProjectContractorTypeWhereInput = {
      OR: query.q ? [{ name: containsInsensitive(query.q) }] : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ProjectContractorTypeOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        contractorCount: (dir) => ({ contractors: { _count: dir } }),
      },
      [{ name: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.projectContractorType.findMany({
        where,
        orderBy,
        select: typeSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectContractorType.findMany({
        where,
        orderBy,
        skip,
        take,
        select: typeSelect,
      }),
      this.prisma.projectContractorType.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.projectContractorType.findUnique({
      where: { id },
      select: typeSelect,
    });
    if (!item) {
      throw new NotFoundException('نوع پیمانکار یافت نشد');
    }
    return item;
  }

  async create(dto: CreateContractorTypeDto) {
    try {
      return await this.prisma.projectContractorType.create({
        data: { name: dto.name },
        select: typeSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateContractorTypeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.projectContractorType.update({
        where: { id },
        data: { name: dto.name },
        select: typeSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.projectContractor.count({ where: { typeId: id } });
    if (used > 0) {
      throw new ConflictException('ابتدا نوع پیمانکاران این مورد را تغییر دهید یا حذف کنید');
    }
    await this.prisma.projectContractorType.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این نوع پیمانکار قبلاً ثبت شده است');
    }
    throw error;
  }
}
