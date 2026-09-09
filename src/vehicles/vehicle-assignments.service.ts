import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseIsoDate, parseOptionalIsoDate } from '../common/iso-date';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleAssignmentDto } from './dto/create-vehicle-assignment.dto';
import { FindVehicleAssignmentsQueryDto } from './dto/find-vehicle-assignments-query.dto';
import { UpdateVehicleAssignmentDto } from './dto/update-vehicle-assignment.dto';

const assignmentSelect = {
  id: true,
  vehicleId: true,
  organizationUnitId: true,
  personId: true,
  startDate: true,
  endDate: true,
  returnedAt: true,
  type: true,
  status: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  organizationUnit: { select: { id: true, name: true } },
  person: { select: { id: true, fullName: true } },
  vehicle: {
    select: {
      id: true,
      plate: true,
      assetCode: true,
      brand: { select: { id: true, name: true } },
      model: true,
    },
  },
} satisfies Prisma.VehicleAssignmentSelect;

@Injectable()
export class VehicleAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(vehicleId: string, query: FindVehicleAssignmentsQueryDto) {
    await this.requireVehicle(vehicleId);
    const where: Prisma.VehicleAssignmentWhereInput = {
      vehicleId,
      status: query.status,
      OR: query.q
        ? [
            { description: containsInsensitive(query.q) },
            { organizationUnit: { name: containsInsensitive(query.q) } },
            { person: { fullName: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy =
      resolveSortOrder<Prisma.VehicleAssignmentOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          startDate: (dir) => ({ startDate: dir }),
          endDate: (dir) => ({ endDate: dir }),
          returnedAt: (dir) => ({ returnedAt: dir }),
          type: (dir) => ({ type: dir }),
          status: (dir) => ({ status: dir }),
          organizationUnit: (dir) => ({ organizationUnit: { name: dir } }),
          person: (dir) => ({ person: { fullName: dir } }),
        },
        [{ startDate: 'desc' }, { id: 'asc' }],
      );
    if (!wantsPagination(query)) {
      return this.prisma.vehicleAssignment.findMany({
        where,
        orderBy,
        select: assignmentSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.vehicleAssignment.findMany({
        where,
        orderBy,
        skip,
        take,
        select: assignmentSelect,
      }),
      this.prisma.vehicleAssignment.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(vehicleId: string, id: string) {
    await this.requireVehicle(vehicleId);
    const item = await this.prisma.vehicleAssignment.findFirst({
      where: { id, vehicleId },
      select: assignmentSelect,
    });
    if (!item) {
      throw new NotFoundException('تخصیص وسیله یافت نشد');
    }
    return item;
  }

  async create(vehicleId: string, dto: CreateVehicleAssignmentDto) {
    await this.requireVehicle(vehicleId);
    const resolved = await this.resolveTargets(dto);
    this.assertDates(dto.startDate, dto.endDate);
    return this.prisma.$transaction(async (tx) => {
      if (!dto.endDate) {
        await this.closeOpenAssignments(tx, vehicleId, dto.startDate);
      }
      return tx.vehicleAssignment.create({
        data: {
          vehicleId,
          type: dto.type,
          organizationUnitId: resolved.organizationUnitId,
          personId: resolved.personId,
          startDate: parseIsoDate(dto.startDate),
          endDate: parseOptionalIsoDate(dto.endDate) ?? null,
          status: 'LENT',
          returnedAt: null,
          description: dto.description,
        },
        select: assignmentSelect,
      });
    });
  }

  async update(
    vehicleId: string,
    id: string,
    dto: UpdateVehicleAssignmentDto,
  ) {
    const current = await this.findOne(vehicleId, id);
    const type = dto.type ?? current.type;
    const startDate = dto.startDate ?? current.startDate.toISOString().slice(0, 10);
    const endDate =
      dto.endDate === undefined
        ? current.endDate
          ? current.endDate.toISOString().slice(0, 10)
          : null
        : dto.endDate;
    const resolved = await this.resolveTargets({
      type,
      organizationUnitId:
        dto.organizationUnitId === undefined
          ? current.organizationUnitId
          : dto.organizationUnitId,
      personId: dto.personId === undefined ? current.personId : dto.personId,
    });
    this.assertDates(startDate, endDate);
    return this.prisma.$transaction(async (tx) => {
      if (!endDate) {
        await this.closeOpenAssignments(tx, vehicleId, startDate, id);
      }
      return tx.vehicleAssignment.update({
        where: { id },
        data: {
          type,
          organizationUnitId: resolved.organizationUnitId,
          personId: resolved.personId,
          startDate: parseIsoDate(startDate),
          endDate: parseOptionalIsoDate(endDate) ?? null,
          description: dto.description,
        },
        select: assignmentSelect,
      });
    });
  }

  async returnItem(
    vehicleId: string,
    id: string,
    dto: { returnedAt: string },
  ) {
    const current = await this.findOne(vehicleId, id);
    if (current.status === 'RETURNED') {
      throw new BadRequestException('این تخصیص قبلاً عودت شده است');
    }
    const startDate = current.startDate.toISOString().slice(0, 10);
    this.assertDates(startDate, dto.returnedAt);
    return this.prisma.vehicleAssignment.update({
      where: { id },
      data: {
        status: 'RETURNED',
        returnedAt: parseIsoDate(dto.returnedAt),
        endDate: parseIsoDate(dto.returnedAt),
      },
      select: assignmentSelect,
    });
  }

  async remove(vehicleId: string, id: string) {
    await this.findOne(vehicleId, id);
    await this.prisma.vehicleAssignment.delete({ where: { id } });
    return { ok: true };
  }

  private async requireVehicle(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('وسیله نقلیه یافت نشد');
    }
    return vehicle;
  }

  private assertDates(startDate: string, endDate?: string | null) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException('تاریخ پایان نباید قبل از تاریخ شروع باشد');
    }
  }

  private async closeOpenAssignments(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    startDate: string,
    excludeId?: string,
  ) {
    const open = await tx.vehicleAssignment.findMany({
      where: {
        vehicleId,
        status: 'LENT',
        id: excludeId ? { not: excludeId } : undefined,
      },
      select: { id: true, startDate: true },
    });
    const closeOn = parseIsoDate(startDate);
    for (const item of open) {
      if (item.startDate.toISOString().slice(0, 10) > startDate) {
        throw new BadRequestException(
          'تخصیص جاری با تاریخ شروع جدید هم‌پوشانی دارد',
        );
      }
      await tx.vehicleAssignment.update({
        where: { id: item.id },
        data: {
          status: 'RETURNED',
          endDate: closeOn,
          returnedAt: closeOn,
        },
      });
    }
  }

  private async resolveTargets(dto: {
    type: 'UNIT' | 'PERSON';
    organizationUnitId?: string | null;
    personId?: string | null;
  }) {
    if (dto.type === 'UNIT') {
      if (!dto.organizationUnitId) {
        throw new BadRequestException('واحد سازمانی را انتخاب کنید');
      }
      const unit = await this.prisma.organizationUnit.findUnique({
        where: { id: dto.organizationUnitId },
        select: { id: true },
      });
      if (!unit) {
        throw new BadRequestException('واحد سازمانی یافت نشد');
      }
      if (dto.personId) {
        const member = await this.prisma.user.findFirst({
          where: { id: dto.personId, orgUnitId: dto.organizationUnitId },
          select: { id: true },
        });
        if (!member) {
          throw new BadRequestException(
            'مسئول باید از اعضای همین واحد باشد',
          );
        }
      }
      return {
        organizationUnitId: dto.organizationUnitId,
        personId: dto.personId ?? null,
      };
    }

    if (!dto.personId) {
      throw new BadRequestException('شخص مسئول را انتخاب کنید');
    }
    const person = await this.prisma.user.findUnique({
      where: { id: dto.personId },
      select: { id: true, orgUnitId: true },
    });
    if (!person) {
      throw new BadRequestException('شخص یافت نشد');
    }
    const organizationUnitId =
      dto.organizationUnitId === undefined
        ? person.orgUnitId
        : dto.organizationUnitId;
    if (organizationUnitId) {
      const unit = await this.prisma.organizationUnit.findUnique({
        where: { id: organizationUnitId },
        select: { id: true },
      });
      if (!unit) {
        throw new BadRequestException('واحد سازمانی یافت نشد');
      }
    }
    return {
      organizationUnitId: organizationUnitId ?? null,
      personId: person.id,
    };
  }
}
