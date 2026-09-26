import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { parseIsoDate, parseOptionalIsoDate, toIsoDateOnly } from '../common/iso-date';
import { toLatinDigits } from '../common/national-id';
import { normalizeMobile } from '../common/phone';
import { resolveSortOrder } from '../common/sort-query';
import { CONTRACTOR_ROLE_CODE } from '../access/access.constants';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { joinFullName } from '../users/user-profile.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { CreateContractorMemberDto } from './dto/create-contractor-member.dto';
import { CreateContractorPaymentDto } from './dto/create-contractor-payment.dto';
import {
  FindContractorMembersQueryDto,
  FindContractorPaymentsQueryDto,
  FindContractorPortalUsersQueryDto,
  FindContractorProjectsQueryDto,
  FindContractorsQueryDto,
} from './dto/find-contractors-query.dto';
import { CreateContractorPortalUserDto } from './dto/create-contractor-portal-user.dto';
import { UpdateContractorPortalUserDto } from './dto/update-contractor-portal-user.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';
import { UpdateContractorMemberDto } from './dto/update-contractor-member.dto';
import { UpdateContractorPaymentDto } from './dto/update-contractor-payment.dto';

const portalUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  fullName: true,
  username: true,
  phone: true,
  status: true,
  contractorId: true,
  createdAt: true,
} as const;

const contractorSelect = {
  id: true,
  projectId: true,
  typeId: true,
  name: true,
  nationalId: true,
  registrationNumber: true,
  phone: true,
  email: true,
  website: true,
  description: true,
  ceoName: true,
  timeEstimate: true,
  costEstimate: true,
  contractStartDate: true,
  contractEndDate: true,
  supportStartDate: true,
  supportEndDate: true,
  createdAt: true,
  updatedAt: true,
  type: { select: { id: true, name: true } },
  project: { select: { id: true, systemName: true } },
  _count: { select: { members: true, payments: true, projectLinks: true } },
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
  T extends {
    costEstimate: Prisma.Decimal | null;
    contractStartDate: Date | null;
    contractEndDate: Date | null;
    supportStartDate: Date | null;
    supportEndDate: Date | null;
  },
>(item: T) {
  return {
    ...item,
    costEstimate: toMoney(item.costEstimate),
    contractStartDate: toIsoDateOnly(item.contractStartDate),
    contractEndDate: toIsoDateOnly(item.contractEndDate),
    supportStartDate: toIsoDateOnly(item.supportStartDate),
    supportEndDate: toIsoDateOnly(item.supportEndDate),
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
            { type: { name: containsInsensitive(query.q) } },
            { nationalId: containsInsensitive(query.q) },
            { registrationNumber: containsInsensitive(query.q) },
            { phone: containsInsensitive(query.q) },
            { email: containsInsensitive(query.q) },
            { website: containsInsensitive(query.q) },
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
        type: (dir) => ({ type: { name: dir } }),
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
    await this.assertType(dto.typeId);
    this.assertContractRanges(dto);
    return withContractorMoney(
      await this.prisma.projectContractor.create({
        data: {
          projectId,
          typeId: dto.typeId,
          name: dto.name,
          nationalId: dto.nationalId,
          registrationNumber: dto.registrationNumber,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          description: dto.description,
          ceoName: dto.ceoName,
          timeEstimate: dto.timeEstimate,
          costEstimate: dto.costEstimate,
          contractStartDate: parseOptionalIsoDate(dto.contractStartDate) ?? null,
          contractEndDate: parseOptionalIsoDate(dto.contractEndDate) ?? null,
          supportStartDate: parseOptionalIsoDate(dto.supportStartDate) ?? null,
          supportEndDate: parseOptionalIsoDate(dto.supportEndDate) ?? null,
          projectLinks: { create: { projectId } },
        },
        select: contractorSelect,
      }),
    );
  }

  async update(projectId: string | undefined, id: string, dto: UpdateContractorDto) {
    const current = await this.findOne(projectId, id);
    if (dto.typeId !== undefined) {
      await this.assertType(dto.typeId);
    }
    this.assertContractRanges({
      contractStartDate:
        dto.contractStartDate !== undefined ? dto.contractStartDate : current.contractStartDate,
      contractEndDate:
        dto.contractEndDate !== undefined ? dto.contractEndDate : current.contractEndDate,
      supportStartDate:
        dto.supportStartDate !== undefined ? dto.supportStartDate : current.supportStartDate,
      supportEndDate:
        dto.supportEndDate !== undefined ? dto.supportEndDate : current.supportEndDate,
    });
    return withContractorMoney(
      await this.prisma.projectContractor.update({
        where: { id },
        data: {
          name: dto.name,
          nationalId: dto.nationalId,
          registrationNumber: dto.registrationNumber,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          description: dto.description,
          ceoName: dto.ceoName,
          timeEstimate: dto.timeEstimate,
          costEstimate: dto.costEstimate,
          ...(dto.typeId !== undefined ? { typeId: dto.typeId } : {}),
          ...(dto.contractStartDate !== undefined
            ? { contractStartDate: parseOptionalIsoDate(dto.contractStartDate) }
            : {}),
          ...(dto.contractEndDate !== undefined
            ? { contractEndDate: parseOptionalIsoDate(dto.contractEndDate) }
            : {}),
          ...(dto.supportStartDate !== undefined
            ? { supportStartDate: parseOptionalIsoDate(dto.supportStartDate) }
            : {}),
          ...(dto.supportEndDate !== undefined
            ? { supportEndDate: parseOptionalIsoDate(dto.supportEndDate) }
            : {}),
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

  async findPortalUsers(
    projectId: string,
    contractorId: string,
    query: FindContractorPortalUsersQueryDto,
  ) {
    await this.findOne(projectId, contractorId);
    const where: Prisma.UserWhereInput = {
      contractorId,
      ...(query.q
        ? {
            OR: [
              { fullName: containsInsensitive(query.q) },
              { username: containsInsensitive(query.q) },
              { phone: containsInsensitive(query.q) },
            ],
          }
        : {}),
    };
    const orderBy = resolveSortOrder<Prisma.UserOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        fullName: (dir) => ({ fullName: dir }),
        username: (dir) => ({ username: dir }),
        phone: (dir) => ({ phone: dir }),
        status: (dir) => ({ status: dir }),
      },
      [{ fullName: 'asc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take,
        select: portalUserSelect,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findPortalUser(projectId: string, contractorId: string, userId: string) {
    await this.findOne(projectId, contractorId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, contractorId },
      select: portalUserSelect,
    });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }
    return user;
  }

  async createPortalUser(
    projectId: string,
    contractorId: string,
    dto: CreateContractorPortalUserDto,
  ) {
    await this.findOne(projectId, contractorId);
    const username = toLatinDigits(dto.username.trim());
    await this.assertPortalUsername(username);
    await this.assertPortalPhone(dto.phone);
    const role = await this.contractorRole();
    const passwordHash = await bcrypt.hash(toLatinDigits(dto.password), 10);
    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        fullName: joinFullName(dto.firstName, dto.lastName),
        phone: dto.phone ?? null,
        locale: 'fa',
        status: UserStatus.ACTIVE,
        contractorId,
        userRoles: { create: { roleId: role.id } },
      },
      select: portalUserSelect,
    });
    return user;
  }

  async updatePortalUser(
    projectId: string,
    contractorId: string,
    userId: string,
    dto: UpdateContractorPortalUserDto,
  ) {
    const current = await this.findPortalUser(projectId, contractorId, userId);
    const username = dto.username ? toLatinDigits(dto.username.trim()) : undefined;
    if (username) {
      await this.assertPortalUsername(username, userId);
    }
    if (dto.phone !== undefined) {
      await this.assertPortalPhone(dto.phone, userId);
    }
    const firstName = dto.firstName?.trim() ?? current.firstName;
    const lastName = dto.lastName?.trim() ?? current.lastName;
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        username,
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        fullName: joinFullName(firstName, lastName),
        phone: dto.phone,
        status: dto.status,
        passwordHash: dto.password
          ? await bcrypt.hash(toLatinDigits(dto.password), 10)
          : undefined,
      },
      select: portalUserSelect,
    });
  }

  async removePortalUser(projectId: string, contractorId: string, userId: string) {
    await this.findPortalUser(projectId, contractorId, userId);
    const [reports, messages, correspondences] = await Promise.all([
      this.prisma.stakeholderProgressReport.count({ where: { createdById: userId } }),
      this.prisma.stakeholderMessage.count({ where: { authorId: userId } }),
      this.prisma.stakeholderCorrespondence.count({ where: { createdById: userId } }),
    ]);
    if (reports + messages + correspondences > 0) {
      throw new ConflictException('این کاربر گزارش یا مکاتبه دارد؛ به‌جای حذف، وضعیت را غیرفعال کنید');
    }
    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  }

  private async contractorRole() {
    const role = await this.prisma.role.findUnique({
      where: { code: CONTRACTOR_ROLE_CODE },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException('نقش پیمانکار در سامانه تعریف نشده است');
    }
    return role;
  }

  private async assertPortalUsername(username: string, excludeId?: string) {
    const taken = await this.prisma.user.findFirst({
      where: { username, id: excludeId ? { not: excludeId } : undefined },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException('این نام کاربری قبلاً ثبت شده است');
    }
  }

  private async assertPortalPhone(phone: string | null | undefined, excludeId?: string) {
    if (!phone) return;
    const taken = await this.prisma.user.findFirst({
      where: { phone, id: excludeId ? { not: excludeId } : undefined },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException('این تلفن همراه قبلاً ثبت شده است');
    }
  }

  private assertContractRanges(dates: {
    contractStartDate?: string | null;
    contractEndDate?: string | null;
    supportStartDate?: string | null;
    supportEndDate?: string | null;
  }) {
    if (
      dates.contractStartDate &&
      dates.contractEndDate &&
      dates.contractEndDate < dates.contractStartDate
    ) {
      throw new BadRequestException('تاریخ پایان قرارداد نباید قبل از تاریخ شروع باشد');
    }
    if (
      dates.supportStartDate &&
      dates.supportEndDate &&
      dates.supportEndDate < dates.supportStartDate
    ) {
      throw new BadRequestException(
        'تاریخ پایان قرارداد پشتیبانی نباید قبل از تاریخ شروع باشد',
      );
    }
  }

  private async assertType(typeId: string | null | undefined) {
    if (!typeId) return;
    const type = await this.prisma.projectContractorType.findUnique({
      where: { id: typeId },
      select: { id: true },
    });
    if (!type) {
      throw new BadRequestException('نوع پیمانکار یافت نشد');
    }
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

}
