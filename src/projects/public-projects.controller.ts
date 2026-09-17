import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { sendDocument } from './project-documents.controller';
import { ProjectDocumentsService } from './project-documents.service';
import { ProjectsService } from './projects.service';

@Controller('public/projects')
export class PublicProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly documents: ProjectDocumentsService,
  ) {}

  @Get('live-board')
  liveBoard() {
    return this.projects.liveBoard({}, { forHomePage: true });
  }

  @Get(':projectId/documents')
  documentsList(@Param('projectId') projectId: string) {
    return this.documents.findAll(projectId, {});
  }

  @Get(':projectId/documents/:id/file')
  async download(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    sendDocument(res, await this.documents.filePayload(projectId, id));
  }
}
