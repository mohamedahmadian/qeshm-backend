import { Module } from '@nestjs/common';
import { ContractorsController } from './contractors.controller';
import { ContractorsService } from './contractors.service';
import { GlobalContractorsController } from './global-contractors.controller';
import { ProgressTranscriptionService } from './progress-transcription.service';
import { ProjectPhasesController } from './project-phases.controller';
import { ProjectPhasesService } from './project-phases.service';
import { ProjectProgressController } from './project-progress.controller';
import { ProjectProgressService } from './project-progress.service';
import { ProjectReportsService } from './project-reports.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [
    ProjectsController,
    GlobalContractorsController,
    ContractorsController,
    ProjectPhasesController,
    ProjectProgressController,
  ],
  providers: [
    ProjectsService,
    ContractorsService,
    ProjectPhasesService,
    ProjectProgressService,
    ProgressTranscriptionService,
    ProjectReportsService,
  ],
  exports: [ProjectsService, ContractorsService, ProjectPhasesService],
})
export class ProjectsModule {}
