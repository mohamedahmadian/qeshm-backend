import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats/projects')
  projectCount() {
    return this.dashboard.projectCount();
  }

  @Get('stats/contractors')
  contractorCount() {
    return this.dashboard.contractorCount();
  }

  @Get('stats/resolutions')
  resolutionCount() {
    return this.dashboard.resolutionCount();
  }

  @Get('stats/qeshmondi')
  qeshmondiCount() {
    return this.dashboard.qeshmondiCount();
  }

  @Get('recent-reports')
  recentReports() {
    return this.dashboard.recentReports();
  }

  @Get('important-projects')
  importantProjects() {
    return this.dashboard.importantProjects();
  }
}
