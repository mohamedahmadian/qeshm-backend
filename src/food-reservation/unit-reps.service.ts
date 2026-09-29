import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { buildOrganizationUnitPaths } from '../organization/organization-unit-tree';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateUnitRepPersonDto } from './dto/assign-unit-rep.dto';
import { FindUnitRepsQueryDto } from './dto/find-unit-reps-query.dto';

const unitRepSelect = {
  id: true,
  name: true,
  nutritionRepId: true,
  kind: { select: { id: true, name: true } },
  nutritionRep: { select: { id: true, fullName: true, phone: true } },
} satisfies Prisma.OrganizationUnitSelect;

@Injectable()
export class UnitRepsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async findAll(query: FindUnitRepsQueryDto) {
    const where: Prisma.OrganizationUnitWhereInput = {
      OR: query.q
        ? [
            { name: containsInsensitive(query.q) },
            { kind: { name: containsInsensitive(query.q) } },
            { parent: { name: containsInsensitive(query.q) } },
            { nutritionRep: { fullName: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.OrganizationUnitOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        kind: (dir) => ({ kind: { name: dir } }),
        representative: (dir) => ({ nutritionRep: { fullName: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total, paths] = await Promise.all([
      this.prisma.organizationUnit.findMany({
        where,
        orderBy,
        skip,
        take,
        select: unitRepSelect,
      }),
      this.prisma.organizationUnit.count({ where }),
      this.unitPaths(),
    ]);
    return paginatedResult(
      items.map((item) => this.withPath(item, paths)),
      total,
      page,
      pageSize,
    );
  }

  async findOne(unitId: string) {
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id: unitId },
      select: unitRepSelect,
    });
    if (!unit) {
      throw new NotFoundException('واحد سازمانی یافت نشد');
    }
    const paths = await this.unitPaths();
    return this.withPath(unit, paths);
  }

  async assign(unitId: string, nutritionRepId: string) {
    await this.findOne(unitId);
    await this.assertNutritionRep(unitId, nutritionRepId);
    const unit = await this.prisma.organizationUnit.update({
      where: { id: unitId },
      data: { nutritionRepId },
      select: unitRepSelect,
    });
    const paths = await this.unitPaths();
    return this.withPath(unit, paths);
  }

  async createPerson(unitId: string, dto: CreateUnitRepPersonDto) {
    await this.findOne(unitId);
    const user = await this.users.create({
      username: dto.phone,
      password: dto.phone,
      firstName: dto.firstName,
      lastName: dto.lastName,
      nationalId: dto.nationalId,
      phone: dto.phone,
      orgUnitId: unitId,
    });
    return this.assign(unitId, user.id);
  }

  async clear(unitId: string) {
    await this.findOne(unitId);
    await this.prisma.organizationUnit.update({
      where: { id: unitId },
      data: { nutritionRepId: null },
    });
    return { ok: true };
  }

  private async unitPaths() {
    const catalog = await this.prisma.organizationUnit.findMany({
      select: { id: true, name: true, parentId: true },
    });
    return buildOrganizationUnitPaths(catalog);
  }

  private withPath<T extends { id: string; name: string }>(
    item: T,
    paths: Map<string, string>,
  ) {
    return {
      ...item,
      pathLabel: paths.get(item.id) ?? item.name,
    };
  }

  private async assertNutritionRep(unitId: string, userId: string) {
    const employee = await this.prisma.user.findFirst({
      where: { id: userId, orgUnitId: unitId },
      select: { id: true },
    });
    if (!employee) {
      throw new BadRequestException('نماینده باید از کارمندان همین واحد باشد');
    }
  }
}
