import { Injectable, NotFoundException } from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationPhoneDto } from './dto/create-organization-phone.dto';
import { FindOrganizationPhonesQueryDto } from './dto/find-organization-phones-query.dto';
import { UpdateOrganizationPhoneDto } from './dto/update-organization-phone.dto';
import { OrganizationService } from './organization.service';

const phoneSelect = {
  id: true,
  organizationId: true,
  title: true,
  phone: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationPhoneSelect;

@Injectable()
export class OrganizationPhonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationService,
  ) {}

  async findAll(query: FindOrganizationPhonesQueryDto) {
    const organizationId = await this.organization.requireId();
    const where: Prisma.OrganizationPhoneWhereInput = {
      organizationId,
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { phone: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.OrganizationPhoneOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        phone: (dir) => ({ phone: dir }),
        description: (dir) => ({ description: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.organizationPhone.findMany({
        where,
        orderBy,
        select: phoneSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.organizationPhone.findMany({
        where,
        orderBy,
        skip,
        take,
        select: phoneSelect,
      }),
      this.prisma.organizationPhone.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const organizationId = await this.organization.requireId();
    const phone = await this.prisma.organizationPhone.findFirst({
      where: { id, organizationId },
      select: phoneSelect,
    });
    if (!phone) {
      throw new NotFoundException('تلفن سازمان یافت نشد');
    }
    return phone;
  }

  async create(dto: CreateOrganizationPhoneDto) {
    const organizationId = await this.organization.requireId();
    return this.prisma.organizationPhone.create({
      data: {
        organizationId,
        title: dto.title,
        phone: dto.phone,
        description: dto.description,
      },
      select: phoneSelect,
    });
  }

  async update(id: string, dto: UpdateOrganizationPhoneDto) {
    await this.findOne(id);
    return this.prisma.organizationPhone.update({
      where: { id },
      data: {
        title: dto.title,
        phone: dto.phone,
        description: dto.description,
      },
      select: phoneSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.organizationPhone.delete({ where: { id } });
    return { ok: true };
  }
}
