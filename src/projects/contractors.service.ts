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
import { parseIsoDate, toIsoDateOnly } from '../common/iso-date';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { CreateContractorMemberDto } from './dto/create-contractor-member.dto';
import { CreateContractorPaymentDto } from './dto/create-contractor-payment.dto';
import { CreateContractorPhaseDto } from './dto/create-contractor-phase.dto';
import {
  FindContractorMembersQueryDto,
  FindContractorPaymentsQueryDto,
  FindContractorPhasesQueryDto,
  FindContractorProjectsQueryDto,
  FindContractorsQueryDto,
} from './dto/find-contractors-query.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';
import { UpdateContractorMemberDto } from './dto/update-contractor-member.dto';
import { UpdateContractorPaymentDto } from './dto/update-contractor-payment.dto';
import { UpdateContractorPhaseDto } from './dto/update-contractor-phase.dto';

const contractorSelect = {
  id: true,
  projectId: true,
  name: true,
  nationalId: true,
  description: true,
  ceoName: true,
  timeEstimate: true,
  costEstimate: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, systemName: true } },
  _count: { select: { members: true, phases: true, payments: true, projectLinks: true } },
} satisfies Prisma.ProjectContractorSelect;

const contractorProjectSelect = {
  id: true,
  systemName: true,
  code: true,
  isActive: true,
  status: true,
  progressPercent: true,
  operators: {
    select: {
      organizationUnit: {
        select: {
          id: true,
          name: true,
          parentId: true,
          kind: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { organizationUnit: { name: 'asc' } },
  },
} satisfies Prisma.ProjectSelect;

function serializeContractorProject<
  T extends {
    operators: Array<{
      organizationUnit: {
        id: string;
        name: string;
        parentId: string | null;
        kind: { id: string; name: string };
      };
    }>;
  },
>(item: T) {
  const { operators, ...rest } = item;
  return {
    ...rest,
    operators: operators.map((link) => ({
      id: link.organizationUnit.id,
      name: link.organizationUnit.name,
      parentId: link.organizationUnit.parentId,
      kind: link.organizationUnit.kind,
      pathLabel: link.organizationUnit.name,
    })),
  };
}

const memberSelect = {
  id: true,
  contractorId: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectContractorMemberSelect;

const phaseSelect = {
  id: true,
  contractorId: true,
  name: true,
  startDate: true,
  endDate: true,
  goals: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectContractorPhaseSelect;

const paymentSelect = {
  id: true,
  contractorId: true,
  paidAt: true,
  amount: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectContractorPaymentSelect;

function toMoney(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value);
}

function withContractorMoney<
  T extends { costEstimate: Prisma.Decimal | null },
>(item: T) {
  return { ...item, costEstimate: toMoney(item.costEstimate) };
}

function withPhaseDates<
  T extends { startDate: Date; endDate: Date },
>(item: T) {
  return {
    ...item,
    startDate: toIsoDateOnly(item.startDate),
    endDate: toIsoDateOnly(item.endDate),
  };
}

function withPaymentMoney<T extends { paidAt: Date; amount: Prisma.Decimal }>(
  item: T,
) {
  return {
    ...item,
    paidAt: toIsoDateOnly(item.paidAt),
    amount: Number(item.amount),
  };
}

@Injectable()
export class ContractorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string | undefined, query: FindContractorsQueryDto) {
    if (projectId) {
      await this.assertProject(projectId);
    }
    const scopedProjectId = projectId ?? query.projectId;
    const search = query.q
      ? {
          OR: [
            { name: containsInsensitive(query.q) },
            { nationalId: containsInsensitive(query.q) },
            { ceoName: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
            { timeEstimate: containsInsensitive(query.q) },
            { project: { systemName: containsInsensitive(query.q) } },
            { project: { code: containsInsensitive(query.q) } },
            {
              projectLinks: {
                some: { project: { systemName: containsInsensitive(query.q) } },
              },
            },
            {
              projectLinks: {
                some: { project: { code: containsInsensitive(query.q) } },
              },
            },
          ],
        }
      : undefined;
    const where: Prisma.ProjectContractorWhereInput = {
      AND: [
        scopedProjectId
          ? {
              OR: [
                { projectId: scopedProjectId },
                { projectLinks: { some: { projectId: scopedProjectId } } },
              ],
            }
          : {},
        search ?? {},
      ],
    };
    const orderBy = resolveSortOrder<Prisma.ProjectContractorOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        nationalId: (dir) => ({ nationalId: dir }),
        ceoName: (dir) => ({ ceoName: dir }),
        timeEstimate: (dir) => ({ timeEstimate: dir }),
        costEstimate: (dir) => ({ costEstimate: dir }),
        project: (dir) => ({ project: { systemName: dir } }),
        projectCount: (dir) => ({ projectLinks: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.projectContractor.findMany({
        where,
        orderBy,
        select: contractorSelect,
      });
      return items.map(withContractorMoney);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectContractor.findMany({
        where,
        orderBy,
        skip,
        take,
        select: contractorSelect,
      }),
      this.prisma.projectContractor.count({ where }),
    ]);
    return paginatedResult(items.map(withContractorMoney), total, page, pageSize);
  }

  async findOne(projectId: string | undefined, id: string) {
    const contractor = await this.prisma.projectContractor.findFirst({
      where: {
        id,
        ...(projectId
          ? {
              OR: [
                { projectId },
                { projectLinks: { some: { projectId } } },
              ],
            }
          : {}),
      },
      select: contractorSelect,
    });
    if (!contractor) {
      throw new NotFoundException('پیمانکار یافت نشد');
    }
    return withContractorMoney(contractor);
  }

  async create(projectId: string, dto: CreateContractorDto) {
    await this.assertProject(projectId);
    return withContractorMoney(
      await this.prisma.projectContractor.create({
        data: {
          projectId,
          name: dto.name,
          nationalId: dto.nationalId,
          description: dto.description,
          ceoName: dto.ceoName,
          timeEstimate: dto.timeEstimate,
          costEstimate: dto.costEstimate,
          projectLinks: { create: { projectId } },
        },
        select: contractorSelect,
      }),
    );
  }

  async update(projectId: string | undefined, id: string, dto: UpdateContractorDto) {
    await this.findOne(projectId, id);
    return withContractorMoney(
      await this.prisma.projectContractor.update({
        where: { id },
        data: {
          name: dto.name,
          nationalId: dto.nationalId,
          description: dto.description,
          ceoName: dto.ceoName,
          timeEstimate: dto.timeEstimate,
          costEstimate: dto.costEstimate,
        },
        select: contractorSelect,
      }),
    );
  }

  async remove(projectId: string | undefined, id: string) {
    await this.findOne(projectId, id);
    await this.prisma.projectContractor.delete({ where: { id } });
    return { ok: true };
  }

  async findProjects(contractorId: string, query: FindContractorProjectsQueryDto) {
    await this.findOne(undefined, contractorId);
    const where: Prisma.ProjectWhereInput = {
      contractorLinks: { some: { contractorId } },
      OR: query.q
        ? [
            { systemName: containsInsensitive(query.q) },
            { code: containsInsensitive(query.q) },
            {
              operators: {
                some: {
                  organizationUnit: { name: containsInsensitive(query.q) },
                },
              },
            },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ProjectOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        systemName: (dir) => ({ systemName: dir }),
        code: (dir) => ({ code: dir }),
        status: (dir) => ({ status: dir }),
        progressPercent: (dir) => ({ progressPercent: dir }),
        operators: (dir) => ({ operators: { _count: dir } }),
      },
      [{ systemName: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.project.findMany({
        where,
        orderBy,
        select: contractorProjectSelect,
      });
      return items.map(serializeContractorProject);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy,
        skip,
        take,
        select: contractorProjectSelect,
      }),
      this.prisma.project.count({ where }),
    ]);
    return paginatedResult(items.map(serializeContractorProject), total, page, pageSize);
  }

  async addProject(contractorId: string, projectId: string) {
    await this.findOne(undefined, contractorId);
    await this.assertProject(projectId);
    const existing = await this.prisma.projectContractorProject.findUnique({
      where: { contractorId_projectId: { contractorId, projectId } },
    });
    if (existing) {
      throw new ConflictException('این پروژه قبلاً برای این پیمانکار ثبت شده است');
    }
    await this.prisma.projectContractorProject.create({
      data: { contractorId, projectId },
    });
    return this.findOne(undefined, contractorId);
  }

  async removeProject(contractorId: string, projectId: string) {
    const contractor = await this.findOne(undefined, contractorId);
    const link = await this.prisma.projectContractorProject.findUnique({
      where: { contractorId_projectId: { contractorId, projectId } },
    });
    if (!link) {
      throw new NotFoundException('این پروژه برای پیمانکار ثبت نشده است');
    }
    const remaining = await this.prisma.projectContractorProject.count({
      where: { contractorId },
    });
    if (remaining <= 1) {
      throw new BadRequestException('حداقل یک پروژه باید برای پیمانکار باقی بماند');
    }
    await this.prisma.projectContractorProject.delete({ where: { id: link.id } });
    if (contractor.projectId === projectId) {
      const next = await this.prisma.projectContractorProject.findFirst({
        where: { contractorId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (next) {
        await this.prisma.projectContractor.update({
          where: { id: contractorId },
          data: { projectId: next.projectId },
        });
      }
    }
    return { ok: true };
  }

  async findMembers(
    projectId: string,
    contractorId: string,
    query: FindContractorMembersQueryDto,
  ) {
    await this.findOne(projectId, contractorId);
    const where: Prisma.ProjectContractorMemberWhereInput = {
      contractorId,
      OR: query.q
        ? [
            { firstName: containsInsensitive(query.q) },
            { lastName: containsInsensitive(query.q) },
            { phone: containsInsensitive(query.q) },
            { role: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ProjectContractorMemberOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        firstName: (dir) => ({ firstName: dir }),
        lastName: (dir) => ({ lastName: dir }),
        phone: (dir) => ({ phone: dir }),
        role: (dir) => ({ role: dir }),
      },
      [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.projectContractorMember.findMany({
        where,
        orderBy,
        select: memberSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectContractorMember.findMany({
        where,
        orderBy,
        skip,
        take,
        select: memberSelect,
      }),
      this.prisma.projectContractorMember.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findMember(projectId: string, contractorId: string, id: string) {
    await this.findOne(projectId, contractorId);
    const member = await this.prisma.projectContractorMember.findFirst({
      where: { id, contractorId },
      select: memberSelect,
    });
    if (!member) {
      throw new NotFoundException('عضو تیم یافت نشد');
    }
    return member;
  }

  async createMember(
    projectId: string,
    contractorId: string,
    dto: CreateContractorMemberDto,
  ) {
    await this.findOne(projectId, contractorId);
    return this.prisma.projectContractorMember.create({
      data: { contractorId, ...dto },
      select: memberSelect,
    });
  }

  async updateMember(
    projectId: string,
    contractorId: string,
    id: string,
    dto: UpdateContractorMemberDto,
  ) {
    await this.findMember(projectId, contractorId, id);
    return this.prisma.projectContractorMember.update({
      where: { id },
      data: dto,
      select: memberSelect,
    });
  }

  async removeMember(projectId: string, contractorId: string, id: string) {
    await this.findMember(projectId, contractorId, id);
    await this.prisma.projectContractorMember.delete({ where: { id } });
    return { ok: true };
  }

  async findPhases(
    projectId: string,
    contractorId: string,
    query: FindContractorPhasesQueryDto,
  ) {
    await this.findOne(projectId, contractorId);
    const where: Prisma.ProjectContractorPhaseWhereInput = {
      contractorId,
      OR: query.q
        ? [
            { name: containsInsensitive(query.q) },
            { goals: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ProjectContractorPhaseOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        startDate: (dir) => ({ startDate: dir }),
        endDate: (dir) => ({ endDate: dir }),
      },
      [{ startDate: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.projectContractorPhase.findMany({
        where,
        orderBy,
        select: phaseSelect,
      });
      return items.map(withPhaseDates);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectContractorPhase.findMany({
        where,
        orderBy,
        skip,
        take,
        select: phaseSelect,
      }),
      this.prisma.projectContractorPhase.count({ where }),
    ]);
    return paginatedResult(items.map(withPhaseDates), total, page, pageSize);
  }

  async findPhase(projectId: string, contractorId: string, id: string) {
    await this.findOne(projectId, contractorId);
    const phase = await this.prisma.projectContractorPhase.findFirst({
      where: { id, contractorId },
      select: phaseSelect,
    });
    if (!phase) {
      throw new NotFoundException('فاز یافت نشد');
    }
    return withPhaseDates(phase);
  }

  async createPhase(
    projectId: string,
    contractorId: string,
    dto: CreateContractorPhaseDto,
  ) {
    await this.findOne(projectId, contractorId);
    this.assertPhaseRange(dto.startDate, dto.endDate);
    return withPhaseDates(
      await this.prisma.projectContractorPhase.create({
        data: {
          contractorId,
          name: dto.name,
          startDate: parseIsoDate(dto.startDate),
          endDate: parseIsoDate(dto.endDate),
          goals: dto.goals,
        },
        select: phaseSelect,
      }),
    );
  }

  async updatePhase(
    projectId: string,
    contractorId: string,
    id: string,
    dto: UpdateContractorPhaseDto,
  ) {
    const current = await this.findPhase(projectId, contractorId, id);
    const startDate = dto.startDate ?? current.startDate;
    const endDate = dto.endDate ?? current.endDate;
    if (startDate && endDate) {
      this.assertPhaseRange(startDate, endDate);
    }
    return withPhaseDates(
      await this.prisma.projectContractorPhase.update({
        where: { id },
        data: {
          name: dto.name,
          startDate: dto.startDate ? parseIsoDate(dto.startDate) : undefined,
          endDate: dto.endDate ? parseIsoDate(dto.endDate) : undefined,
          goals: dto.goals,
        },
        select: phaseSelect,
      }),
    );
  }

  async removePhase(projectId: string, contractorId: string, id: string) {
    await this.findPhase(projectId, contractorId, id);
    await this.prisma.projectContractorPhase.delete({ where: { id } });
    return { ok: true };
  }

  async findPayments(
    projectId: string,
    contractorId: string,
    query: FindContractorPaymentsQueryDto,
  ) {
    await this.findOne(projectId, contractorId);
    const where: Prisma.ProjectContractorPaymentWhereInput = {
      contractorId,
      OR: query.q
        ? [{ description: containsInsensitive(query.q) }]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ProjectContractorPaymentOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        paidAt: (dir) => ({ paidAt: dir }),
        amount: (dir) => ({ amount: dir }),
        description: (dir) => ({ description: dir }),
      },
      [{ paidAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.projectContractorPayment.findMany({
        where,
        orderBy,
        select: paymentSelect,
      });
      return items.map(withPaymentMoney);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectContractorPayment.findMany({
        where,
        orderBy,
        skip,
        take,
        select: paymentSelect,
      }),
      this.prisma.projectContractorPayment.count({ where }),
    ]);
    return paginatedResult(items.map(withPaymentMoney), total, page, pageSize);
  }

  async findPayment(projectId: string, contractorId: string, id: string) {
    await this.findOne(projectId, contractorId);
    const payment = await this.prisma.projectContractorPayment.findFirst({
      where: { id, contractorId },
      select: paymentSelect,
    });
    if (!payment) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    return withPaymentMoney(payment);
  }

  async createPayment(
    projectId: string,
    contractorId: string,
    dto: CreateContractorPaymentDto,
  ) {
    await this.findOne(projectId, contractorId);
    return withPaymentMoney(
      await this.prisma.projectContractorPayment.create({
        data: {
          contractorId,
          paidAt: parseIsoDate(dto.paidAt),
          amount: dto.amount,
          description: dto.description,
        },
        select: paymentSelect,
      }),
    );
  }

  async updatePayment(
    projectId: string,
    contractorId: string,
    id: string,
    dto: UpdateContractorPaymentDto,
  ) {
    await this.findPayment(projectId, contractorId, id);
    return withPaymentMoney(
      await this.prisma.projectContractorPayment.update({
        where: { id },
        data: {
          paidAt: dto.paidAt ? parseIsoDate(dto.paidAt) : undefined,
          amount: dto.amount,
          description: dto.description,
        },
        select: paymentSelect,
      }),
    );
  }

  async removePayment(projectId: string, contractorId: string, id: string) {
    await this.findPayment(projectId, contractorId, id);
    await this.prisma.projectContractorPayment.delete({ where: { id } });
    return { ok: true };
  }

  private async assertProject(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('پروژه یافت نشد');
    }
  }

  private assertPhaseRange(startDate: string, endDate: string) {
    if (endDate < startDate) {
      throw new BadRequestException('تاریخ پایان نباید قبل از تاریخ شروع باشد');
    }
  }
}
