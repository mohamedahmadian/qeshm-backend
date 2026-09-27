import { Injectable } from '@nestjs/common';
import { toIsoDateOnly } from '../common/iso-date';
import { PrismaService } from '../prisma/prisma.service';

const RECENT_REPORT_LIMIT = 5;
const IMPORTANT_PROJECT_LIMIT = 6;
const NEW_REPORT_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async projectCount() {
    const total = await this.prisma.project.count();
    return { total };
  }

  async contractorCount() {
    const total = await this.prisma.projectContractor.count();
    return { total };
  }

  async resolutionCount() {
    const total = await this.prisma.boardMinutesResolution.count();
    return { total };
  }

  async qeshmondiCount() {
    const total = await this.prisma.user.count({ where: { isQeshmondi: true } });
    return { total };
  }

  async recentReports() {
    const rows = await this.prisma.stakeholderProgressReport.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: RECENT_REPORT_LIMIT,
      select: {
        id: true,
        createdAt: true,
        occurredAt: true,
        project: { select: { systemName: true } },
        contractor: { select: { name: true } },
      },
    });
    const freshAfter = Date.now() - NEW_REPORT_MS;
    return {
      items: rows.map((row) => ({
        id: row.id,
        projectName: row.project.systemName,
        contractorName: row.contractor.name,
        reportType: 'PROGRESS' as const,
        occurredAt: toIsoDateOnly(row.occurredAt),
        isNew: row.createdAt.getTime() >= freshAfter,
      })),
    };
  }

  async importantProjects() {
    const rows = await this.prisma.project.findMany({
      where: {
        isActive: true,
        status: { not: 'COMPLETED' },
        importance: { in: ['VERY_HIGH', 'HIGH'] },
      },
      orderBy: [
        { importance: 'asc' },
        { endDate: { sort: 'asc', nulls: 'last' } },
        { id: 'asc' },
      ],
      take: IMPORTANT_PROJECT_LIMIT,
      select: {
        id: true,
        systemName: true,
        code: true,
        endDate: true,
        importance: true,
        status: true,
        color: true,
      },
    });
    return {
      items: rows.map((row) => ({
        ...row,
        endDate: toIsoDateOnly(row.endDate),
      })),
    };
  }
}
