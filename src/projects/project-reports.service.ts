import { Injectable } from '@nestjs/common';
import { todayIsoDateTehran, toIsoDateOnly } from '../common/iso-date';
import { Prisma, ProjectImportance, ProjectStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindProjectsQueryDto } from './dto/find-projects-query.dto';
import { ProjectsService } from './projects.service';

const IMPORTANCE_ORDER: ProjectImportance[] = [
  'VERY_HIGH',
  'HIGH',
  'MEDIUM',
  'LOW',
];

const LIFECYCLE_ORDER: ProjectStatus[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'SUSPENDED',
  'COMPLETED',
];

type OrgBucket = {
  name: string;
  count: number;
  activeCount: number;
  contractorCount: number;
  estimate: number;
  paid: number;
};

type MoneyName = { name: string; estimate: number; paid: number };

function toMoney(value: Prisma.Decimal | null | undefined) {
  return value == null ? 0 : Number(value);
}

function emptyOrg(name: string): OrgBucket {
  return {
    name,
    count: 0,
    activeCount: 0,
    contractorCount: 0,
    estimate: 0,
    paid: 0,
  };
}

function sortByCount<T extends { count: number; name: string }>(
  items: T[],
  limit?: number,
) {
  const next = [...items].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa'),
  );
  return limit == null ? next : next.slice(0, limit);
}

function sortByPaid<T extends { paid: number; estimate: number; name: string }>(
  items: T[],
  limit: number,
) {
  return [...items]
    .sort(
      (a, b) =>
        b.paid - a.paid ||
        b.estimate - a.estimate ||
        a.name.localeCompare(b.name, 'fa'),
    )
    .slice(0, limit);
}

@Injectable()
export class ProjectReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async overview(query: FindProjectsQueryDto) {
    const today = todayIsoDateTehran();
    const projects = await this.prisma.project.findMany({
      where: this.projects.listWhere(query),
      select: {
        id: true,
        vicePresidency: true,
        management: true,
        unit: true,
        systemName: true,
        isActive: true,
        status: true,
        progressPercent: true,
        isSupportActive: true,
        companyName: true,
        systemUrl: true,
        launchYear: true,
        replacementProjectId: true,
        importance: true,
        contractors: {
          select: {
            id: true,
            name: true,
            costEstimate: true,
            _count: { select: { members: true } },
            phases: { select: { startDate: true, endDate: true } },
            payments: { select: { paidAt: true, amount: true } },
          },
        },
      },
    });

    const byImportance = new Map<ProjectImportance, number>(
      IMPORTANCE_ORDER.map((key) => [key, 0]),
    );
    const byLifecycle = new Map<ProjectStatus | 'unset', number>([
      ...LIFECYCLE_ORDER.map((key): [ProjectStatus, number] => [key, 0]),
      ['unset', 0],
    ]);
    const byVice = new Map<string, OrgBucket>();
    const byManagement = new Map<string, OrgBucket>();
    const byUnit = new Map<string, OrgBucket>();
    const byCompany = new Map<string, number>();
    const byLaunchYear = new Map<
      string,
      { year: number | null; count: number; activeCount: number }
    >();
    const paymentByMonth = new Map<string, { amount: number; count: number }>();
    const topProjects: Array<{
      id: string;
      name: string;
      vicePresidency: string;
      contractorCount: number;
      memberCount: number;
      phaseCount: number;
      estimate: number;
      paid: number;
    }> = [];
    const topContractors: Array<{
      id: string;
      name: string;
      projectId: string;
      projectName: string;
      memberCount: number;
      phaseCount: number;
      estimate: number;
      paid: number;
    }> = [];

    let activeProjects = 0;
    let supportActive = 0;
    let withContractors = 0;
    let withReplacement = 0;
    let withUrl = 0;
    let withCompany = 0;
    let withLaunchYear = 0;
    let totalContractors = 0;
    let totalMembers = 0;
    let totalPhases = 0;
    let totalPayments = 0;
    let totalCostEstimate = 0;
    let totalPaid = 0;
    let overspendContractors = 0;
    let upcomingPhases = 0;
    let ongoingPhases = 0;
    let endedPhases = 0;
    let phaseDays = 0;
    let progressTotal = 0;
    let progressCount = 0;

    for (const project of projects) {
      if (project.isActive) activeProjects += 1;
      byLifecycle.set(
        project.status ?? 'unset',
        (byLifecycle.get(project.status ?? 'unset') ?? 0) + 1,
      );
      if (project.progressPercent != null) {
        progressTotal += project.progressPercent;
        progressCount += 1;
      }
      if (project.isSupportActive) supportActive += 1;
      if (project.replacementProjectId) withReplacement += 1;
      if (project.systemUrl) withUrl += 1;
      if (project.companyName) {
        withCompany += 1;
        byCompany.set(
          project.companyName,
          (byCompany.get(project.companyName) ?? 0) + 1,
        );
      }
      if (project.launchYear != null) withLaunchYear += 1;
      byImportance.set(
        project.importance,
        (byImportance.get(project.importance) ?? 0) + 1,
      );

      const yearKey = project.launchYear == null ? '' : String(project.launchYear);
      const yearBucket = byLaunchYear.get(yearKey) ?? {
        year: project.launchYear,
        count: 0,
        activeCount: 0,
      };
      yearBucket.count += 1;
      if (project.isActive) yearBucket.activeCount += 1;
      byLaunchYear.set(yearKey, yearBucket);

      let projectEstimate = 0;
      let projectPaid = 0;
      let projectMembers = 0;
      let projectPhases = 0;

      for (const contractor of project.contractors) {
        const estimate = toMoney(contractor.costEstimate);
        const paid = contractor.payments.reduce(
          (sum, payment) => sum + toMoney(payment.amount),
          0,
        );
        const members = contractor._count.members;
        const phases = contractor.phases.length;

        totalContractors += 1;
        totalMembers += members;
        totalPhases += phases;
        totalPayments += contractor.payments.length;
        totalCostEstimate += estimate;
        totalPaid += paid;
        projectEstimate += estimate;
        projectPaid += paid;
        projectMembers += members;
        projectPhases += phases;
        if (estimate > 0 && paid > estimate) overspendContractors += 1;

        for (const payment of contractor.payments) {
          const month = toIsoDateOnly(payment.paidAt)?.slice(0, 7);
          if (!month) continue;
          const bucket = paymentByMonth.get(month) ?? { amount: 0, count: 0 };
          bucket.amount += toMoney(payment.amount);
          bucket.count += 1;
          paymentByMonth.set(month, bucket);
        }

        for (const phase of contractor.phases) {
          const start = toIsoDateOnly(phase.startDate);
          const end = toIsoDateOnly(phase.endDate);
          if (start && end) {
            const startMs = Date.parse(`${start}T00:00:00.000Z`);
            const endMs = Date.parse(`${end}T00:00:00.000Z`);
            if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
              phaseDays += Math.round((endMs - startMs) / 86_400_000) + 1;
            }
          }
          if (start && start > today) upcomingPhases += 1;
          else if (end && end < today) endedPhases += 1;
          else ongoingPhases += 1;
        }

        topContractors.push({
          id: contractor.id,
          name: contractor.name,
          projectId: project.id,
          projectName: project.systemName,
          memberCount: members,
          phaseCount: phases,
          estimate,
          paid,
        });
      }

      if (project.contractors.length > 0) withContractors += 1;

      this.touchOrg(byVice, project.vicePresidency, project, projectEstimate, projectPaid);
      this.touchOrg(byManagement, project.management, project, projectEstimate, projectPaid);
      this.touchOrg(byUnit, project.unit, project, projectEstimate, projectPaid);

      topProjects.push({
        id: project.id,
        name: project.systemName,
        vicePresidency: project.vicePresidency,
        contractorCount: project.contractors.length,
        memberCount: projectMembers,
        phaseCount: projectPhases,
        estimate: projectEstimate,
        paid: projectPaid,
      });
    }

    const totalProjects = projects.length;
    const remainingEstimate = totalCostEstimate - totalPaid;

    return {
      kpis: {
        totalProjects,
        activeProjects,
        inactiveProjects: totalProjects - activeProjects,
        supportActive,
        supportInactive: totalProjects - supportActive,
        withContractors,
        withoutContractors: totalProjects - withContractors,
        withReplacement,
        withoutReplacement: totalProjects - withReplacement,
        withUrl,
        withCompany,
        withLaunchYear,
        totalContractors,
        totalMembers,
        totalPhases,
        totalPayments,
        totalCostEstimate,
        totalPaid,
        remainingEstimate,
        overspendContractors,
        upcomingPhases,
        ongoingPhases,
        endedPhases,
        avgContractorsPerProject: this.avg(totalContractors, totalProjects),
        avgMembersPerContractor: this.avg(totalMembers, totalContractors),
        avgPhaseDays: this.avg(phaseDays, totalPhases),
        avgProgressPercent: this.avg(progressTotal, progressCount),
        paidRatio: totalCostEstimate > 0 ? totalPaid / totalCostEstimate : null,
      },
      byImportance: IMPORTANCE_ORDER.map((key) => ({
        key,
        count: byImportance.get(key) ?? 0,
      })),
      byLifecycleStatus: [
        ...LIFECYCLE_ORDER.map((key) => ({
          key,
          count: byLifecycle.get(key) ?? 0,
        })),
        { key: 'unset', count: byLifecycle.get('unset') ?? 0 },
      ],
      byStatus: [
        { key: 'active', count: activeProjects },
        { key: 'inactive', count: totalProjects - activeProjects },
      ],
      bySupport: [
        { key: 'active', count: supportActive },
        { key: 'inactive', count: totalProjects - supportActive },
      ],
      byContractorCoverage: [
        { key: 'with', count: withContractors },
        { key: 'without', count: totalProjects - withContractors },
      ],
      byPhaseStatus: [
        { key: 'upcoming', count: upcomingPhases },
        { key: 'ongoing', count: ongoingPhases },
        { key: 'ended', count: endedPhases },
      ],
      byVicePresidency: sortByCount([...byVice.values()]),
      byManagement: sortByCount([...byManagement.values()], 12),
      byUnit: sortByCount([...byUnit.values()], 12),
      byCompany: sortByCount(
        [...byCompany.entries()].map(([name, count]) => ({ name, count })),
        10,
      ),
      byLaunchYear: [...byLaunchYear.values()].sort((a, b) => {
        if (a.year == null) return 1;
        if (b.year == null) return -1;
        return a.year - b.year;
      }),
      paymentByMonth: [...paymentByMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, item]) => ({ month, ...item })),
      financeByVicePresidency: this.financeRows(byVice),
      topProjects: sortByPaid(topProjects, 8),
      topContractors: sortByPaid(topContractors, 8),
    };
  }

  private touchOrg(
    map: Map<string, OrgBucket>,
    name: string,
    project: { isActive: boolean; contractors: unknown[] },
    estimate: number,
    paid: number,
  ) {
    const bucket = map.get(name) ?? emptyOrg(name);
    bucket.count += 1;
    if (project.isActive) bucket.activeCount += 1;
    bucket.contractorCount += project.contractors.length;
    bucket.estimate += estimate;
    bucket.paid += paid;
    map.set(name, bucket);
  }

  private financeRows(map: Map<string, OrgBucket>): MoneyName[] {
    return [...map.values()]
      .filter((item) => item.estimate > 0 || item.paid > 0)
      .sort(
        (a, b) =>
          b.paid + b.estimate - (a.paid + a.estimate) ||
          a.name.localeCompare(b.name, 'fa'),
      )
      .slice(0, 10)
      .map(({ name, estimate, paid }) => ({ name, estimate, paid }));
  }

  private avg(total: number, count: number) {
    if (count <= 0) return 0;
    return Math.round((total / count) * 10) / 10;
  }
}
