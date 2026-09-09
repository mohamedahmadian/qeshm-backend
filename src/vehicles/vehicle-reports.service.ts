import { Injectable } from '@nestjs/common';
import {
  VehicleStatus,
  VehicleType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { vehicleStatuses, vehicleTypes } from './dto/create-vehicle.dto';
import { FindVehiclesQueryDto } from './dto/find-vehicles-query.dto';
import { currentAssignmentWhere, VehiclesService } from './vehicles.service';

type NamedCount = { id: string | null; name: string; count: number };

function sortByCount<T extends { count: number; name: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa'),
  );
}

@Injectable()
export class VehicleReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
  ) {}

  async overview(query: FindVehiclesQueryDto) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: this.vehicles.listWhere(query),
      select: {
        id: true,
        type: true,
        brand: { select: { name: true } },
        model: true,
        status: true,
        assignments: {
          where: currentAssignmentWhere(),
          orderBy: { startDate: 'desc' },
          take: 1,
          select: {
            type: true,
            organizationUnitId: true,
            organizationUnit: { select: { id: true, name: true } },
            personId: true,
            person: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    const byType = new Map<VehicleType, number>(
      vehicleTypes.map((key) => [key, 0]),
    );
    const byStatus = new Map<VehicleStatus, number>(
      vehicleStatuses.map((key) => [key, 0]),
    );
    const byBrand = new Map<string, number>();
    const byModel = new Map<string, { name: string; count: number }>();
    const byUnit = new Map<string, NamedCount>();
    const byPerson = new Map<string, NamedCount>();
    let assigned = 0;
    let unitAssignments = 0;
    let personAssignments = 0;

    for (const vehicle of vehicles) {
      byType.set(vehicle.type, (byType.get(vehicle.type) ?? 0) + 1);
      byStatus.set(vehicle.status, (byStatus.get(vehicle.status) ?? 0) + 1);
      byBrand.set(vehicle.brand.name, (byBrand.get(vehicle.brand.name) ?? 0) + 1);
      const modelName = `${vehicle.brand.name} ${vehicle.model}`.trim();
      const modelBucket = byModel.get(modelName) ?? { name: modelName, count: 0 };
      modelBucket.count += 1;
      byModel.set(modelName, modelBucket);

      const current = vehicle.assignments[0];
      if (!current) continue;
      assigned += 1;
      if (current.type === 'UNIT') unitAssignments += 1;
      if (current.type === 'PERSON') personAssignments += 1;

      if (current.organizationUnit) {
        const unit = byUnit.get(current.organizationUnit.id) ?? {
          id: current.organizationUnit.id,
          name: current.organizationUnit.name,
          count: 0,
        };
        unit.count += 1;
        byUnit.set(current.organizationUnit.id, unit);
      }
      if (current.person) {
        const person = byPerson.get(current.person.id) ?? {
          id: current.person.id,
          name: current.person.fullName,
          count: 0,
        };
        person.count += 1;
        byPerson.set(current.person.id, person);
      }
    }

    const typeRows = vehicleTypes.map((key) => ({
      key,
      count: byType.get(key) ?? 0,
    }));
    const statusRows = vehicleStatuses.map((key) => ({
      key,
      count: byStatus.get(key) ?? 0,
    }));
    const topType = sortByCount(
      typeRows.map((item) => ({ name: item.key, count: item.count })),
    )[0];
    const topModel = sortByCount([...byModel.values()])[0];
    const allUnits = await this.prisma.organizationUnit.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    for (const unit of allUnits) {
      if (!byUnit.has(unit.id)) {
        byUnit.set(unit.id, { id: unit.id, name: unit.name, count: 0 });
      }
    }
    const unitRows = sortByCount([...byUnit.values()]);
    const personRows = sortByCount([...byPerson.values()]);
    const brandRows = sortByCount(
      [...byBrand.entries()].map(([name, count]) => ({ name, count })),
    );
    const total = vehicles.length;
    const unassigned = total - assigned;
    const statusCount = (key: VehicleStatus) => byStatus.get(key) ?? 0;

    return {
      kpis: {
        totalVehicles: total,
        activeVehicles: statusCount('ACTIVE'),
        inRepair: statusCount('IN_REPAIR'),
        scrapped: statusCount('SCRAPPED'),
        transferred: statusCount('TRANSFERRED'),
        missing: statusCount('MISSING'),
        assigned,
        unassigned,
        unitAssignments,
        personAssignments,
        topType: topType?.count ? topType.name : null,
        topTypeCount: topType?.count ?? 0,
        topModel: topModel?.count ? topModel.name : null,
        topModelCount: topModel?.count ?? 0,
        topUnit: unitRows[0]?.count ? unitRows[0].name : null,
        topUnitCount: unitRows[0]?.count ?? 0,
        topCustodian: personRows[0]?.count ? personRows[0].name : null,
        topCustodianCount: personRows[0]?.count ?? 0,
      },
      byType: typeRows,
      byStatus: statusRows,
      byAssignment: [
        { key: 'assigned', count: assigned },
        { key: 'unassigned', count: unassigned },
      ],
      byAssignmentType: [
        { key: 'UNIT', count: unitAssignments },
        { key: 'PERSON', count: personAssignments },
      ],
      byUnit: unitRows,
      byPerson: personRows.slice(0, 12),
      byBrand: brandRows.slice(0, 12),
      byModel: sortByCount([...byModel.values()]).slice(0, 12),
    };
  }
}
