import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CreateProjectDocumentDto } from './dto/create-project-document.dto';
import { FindProjectDocumentsQueryDto } from './dto/find-project-documents-query.dto';
import { UpdateProjectDocumentDto } from './dto/update-project-document.dto';
import { ProjectDocumentsService } from './project-documents.service';

type UploadedDocument = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

const fileUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function sendDocument(
  res: Response,
  file: { data: Buffer; mimeType: string; originalName: string },
) {
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

@Controller('projects/:projectId/documents')
export class ProjectDocumentsController {
  constructor(private readonly documents: ProjectDocumentsService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query() query: FindProjectDocumentsQueryDto,
  ) {
    return this.documents.findAll(projectId, query);
  }

  @Post()
  @UseInterceptors(fileUpload)
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectDocumentDto,
    @UploadedFile() file: UploadedDocument,
  ) {
    return this.documents.create(projectId, dto, file);
  }

  @Get(':id/file')
  async download(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    sendDocument(res, await this.documents.filePayload(projectId, id));
  }

  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.documents.findOne(projectId, id);
  }

  @Patch(':id')
  @UseInterceptors(fileUpload)
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDocumentDto,
    @UploadedFile() file?: UploadedDocument,
  ) {
    return this.documents.update(projectId, id, dto, file);
  }

  @Delete(':id')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.documents.remove(projectId, id);
  }
}
