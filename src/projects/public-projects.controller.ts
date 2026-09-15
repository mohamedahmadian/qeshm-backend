import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
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
    return this.projects.liveBoard({});
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
    const file = await this.documents.filePayload(projectId, id);
    const name = file.originalName?.trim() || 'document';
    const ascii = name.replace(/[^\w.\-]+/g, '_') || 'document';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.data.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    res.send(file.data);
  }
}
