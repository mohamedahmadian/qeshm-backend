import { Module } from '@nestjs/common';
import { ContractorTypesController } from './contractor-types.controller';
import { ContractorTypesService } from './contractor-types.service';
import { ContractorsController } from './contractors.controller';
import { ContractorsService } from './contractors.service';
import { GlobalContractorsController } from './global-contractors.controller';
import { ProgressTranscriptionService } from './progress-transcription.service';
import { ProjectDocumentsController } from './project-documents.controller';
import { ProjectDocumentsService } from './project-documents.service';
import { ProjectGroupsController } from './project-groups.controller';
import { ProjectGroupsService } from './project-groups.service';
import {
  ProjectChecklistController,
  ProjectPhaseChecklistController,
} from './project-checklist.controller';
import { ProjectChecklistService } from './project-checklist.service';
import { ProjectPhasesController } from './project-phases.controller';
import { ProjectPhasesService } from './project-phases.service';
import { ProjectProgressController } from './project-progress.controller';
import { ProjectProgressService } from './project-progress.service';
import { ProjectReportsService } from './project-reports.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PublicProjectsController } from './public-projects.controller';

@Module({
  controllers: [
    PublicProjectsController,
    ProjectGroupsController,
    ProjectsController,
    GlobalContractorsController,
    ContractorTypesController,
    ContractorsController,
    ProjectPhasesController,
    ProjectChecklistController,
    ProjectPhaseChecklistController,
    ProjectDocumentsController,
    ProjectProgressController,
  ],
  providers: [
    ProjectsService,
    ProjectGroupsService,
    ContractorsService,
    ContractorTypesService,
    ProjectPhasesService,
    ProjectChecklistService,
    ProjectDocumentsService,
    ProjectProgressService,
    ProgressTranscriptionService,
    ProjectReportsService,
  ],
  exports: [ProjectsService, ContractorsService, ProjectPhasesService, ProjectDocumentsService],
})
export class ProjectsModule {}
