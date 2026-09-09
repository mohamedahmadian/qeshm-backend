import { Module } from '@nestjs/common';
import { ContractorsController } from './contractors.controller';
import { ContractorsService } from './contractors.service';
import { ProjectReportsService } from './project-reports.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController, ContractorsController],
  providers: [ProjectsService, ContractorsService, ProjectReportsService],
  exports: [ProjectsService, ContractorsService],
})
export class ProjectsModule {}
