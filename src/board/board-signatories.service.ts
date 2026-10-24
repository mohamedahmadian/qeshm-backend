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
import { CreateBoardSignatoryDto } from './dto/create-board-signatory.dto';
import { FindBoardSignatoriesQueryDto } from './dto/find-board-signatories-query.dto';
import { UpdateBoardSignatoryDto } from './dto/update-board-signatory.dto';

const signatorySelect = {
  id: true,
  firstName: true,
  lastName: true,
  title: true,
  signatureImageId: true,
  userId: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, fullName: true } },
} satisfies Prisma.BoardSignatorySelect;

function optionalConnect(id: string | null | undefined) {
  if (id === undefined) return undefined;
  return id ? { connect: { id } } : { disconnect: true };
}

@Injectable()
export class BoardSignatoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindBoardSignatoriesQueryDto) {
    const where: Prisma.BoardSignatoryWhereInput = {
      OR: query.q
        ? [
            { firstName: containsInsensitive(query.q) },
            { lastName: containsInsensitive(query.q) },
            { title: containsInsensitive(query.q) },
            { user: { fullName: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.BoardSignatoryOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        firstName: (dir) => ({ firstName: dir }),
        lastName: (dir) => ({ lastName: dir }),
        title: (dir) => ({ title: dir }),
        user: (dir) => ({ user: { fullName: dir } }),
        sortOrder: (dir) => ({ sortOrder: dir }),
      },
      [{ sortOrder: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.boardSignatory.findMany({
        where,
        orderBy,
        select: signatorySelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.boardSignatory.findMany({
        where,
        orderBy,
        skip,
        take,
        select: signatorySelect,
      }),
      this.prisma.boardSignatory.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.boardSignatory.findUnique({
      where: { id },
      select: signatorySelect,
    });
    if (!item) {
      throw new NotFoundException('دارنده حق امضا یافت نشد');
    }
    return item;
  }

  async create(dto: CreateBoardSignatoryDto) {
    await this.assertImage(dto.signatureImageId);
    await this.assertUser(dto.userId);
    try {
      return await this.prisma.boardSignatory.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          title: dto.title,
          signatureImageId: dto.signatureImageId,
          userId: dto.userId ?? null,
          sortOrder: dto.sortOrder ?? 0,
        },
        select: signatorySelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateBoardSignatoryDto) {
    await this.findOne(id);
    await this.assertImage(dto.signatureImageId);
    await this.assertUser(dto.userId);
    try {
      return await this.prisma.boardSignatory.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          title: dto.title,
          signatureImage: optionalConnect(dto.signatureImageId),
          user: optionalConnect(dto.userId),
          sortOrder: dto.sortOrder,
        },
        select: signatorySelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.boardSignatory.delete({ where: { id } });
    return { ok: true };
  }

  private async assertImage(id?: string | null) {
    if (!id) return;
    const count = await this.prisma.storedImage.count({ where: { id } });
    if (!count) {
      throw new BadRequestException('تصویر امضا معتبر نیست');
    }
  }

  private async assertUser(id?: string | null) {
    if (!id) return;
    const count = await this.prisma.user.count({ where: { id } });
    if (!count) {
      throw new BadRequestException('کاربر انتخاب‌شده معتبر نیست');
    }
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این کاربر قبلاً به‌عنوان دارنده حق امضا ثبت شده است');
    }
    throw error;
  }
}
