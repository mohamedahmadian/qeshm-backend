import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const SINGLETON_KEY = 'default';

const organizationSelect = {
  id: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  eitaa: true,
  bale: true,
  rubika: true,
  instagram: true,
  telegram: true,
  whatsapp: true,
  createdAt: true,
  updatedAt: true,
  phones: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      phone: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  _count: { select: { phones: true } },
} satisfies Prisma.OrganizationSelect;

function toCoord(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value);
}

function toDecimal(value: number | null | undefined) {
  if (value === undefined) {
    return undefined;
  }
  return value == null ? null : new Prisma.Decimal(value);
}

function withCoords<
  T extends { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null },
>(item: T) {
  return {
    ...item,
    latitude: toCoord(item.latitude),
    longitude: toCoord(item.longitude),
  };
}

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrent() {
    const organization = await this.prisma.organization.findUnique({
      where: { singletonKey: SINGLETON_KEY },
      select: organizationSelect,
    });
    if (!organization) {
      throw new NotFoundException('اطلاعات سازمان ثبت نشده است');
    }
    return withCoords(organization);
  }

  async requireId() {
    const organization = await this.findCurrent();
    return organization.id;
  }

  async create(dto: CreateOrganizationDto) {
    const existing = await this.prisma.organization.count({
      where: { singletonKey: SINGLETON_KEY },
    });
    if (existing > 0) {
      throw new ConflictException('اطلاعات سازمان قبلاً ثبت شده است');
    }
    const organization = await this.prisma.organization.create({
      data: {
        singletonKey: SINGLETON_KEY,
        name: dto.name,
        address: dto.address,
        latitude: toDecimal(dto.latitude),
        longitude: toDecimal(dto.longitude),
        eitaa: dto.eitaa,
        bale: dto.bale,
        rubika: dto.rubika,
        instagram: dto.instagram,
        telegram: dto.telegram,
        whatsapp: dto.whatsapp,
      },
      select: organizationSelect,
    });
    return withCoords(organization);
  }

  async update(dto: UpdateOrganizationDto) {
    const current = await this.findCurrent();
    const organization = await this.prisma.organization.update({
      where: { id: current.id },
      data: {
        name: dto.name,
        address: dto.address,
        latitude: toDecimal(dto.latitude),
        longitude: toDecimal(dto.longitude),
        eitaa: dto.eitaa,
        bale: dto.bale,
        rubika: dto.rubika,
        instagram: dto.instagram,
        telegram: dto.telegram,
        whatsapp: dto.whatsapp,
      },
      select: organizationSelect,
    });
    return withCoords(organization);
  }
}
