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
import { memoryStorage, type Options as MulterOptions } from 'multer';
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
  limits: { fileSize: 500 * 1024 * 1024 },
  defParamCharset: 'utf8',
} as MulterOptions);

export function canPreviewDocument(mimeType: string) {
  const mime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mime === 'application/pdf' || mime.startsWith('video/');
}

export function sendDocument(
  res: Response,
  file: { data: Buffer; mimeType: string; originalName: string },
  options?: { inline?: boolean },
) {
  const name = file.originalName?.trim() || 'document';
  const ascii = name.replace(/[^\w.\-]+/g, '_') || 'document';
  const inline = Boolean(options?.inline) && canPreviewDocument(file.mimeType);
  const disposition = inline ? 'inline' : 'attachment';
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  );

  const total = file.data.length;
  const rangeHeader = res.req.headers.range;
  const range =
    inline && file.mimeType.toLowerCase().startsWith('video/') && typeof rangeHeader === 'string'
      ? rangeHeader
      : undefined;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    const invalid = () => {
      res.setHeader('Content-Range', `bytes */${total}`);
      res.status(416).end();
    };
    if (!match || total === 0) {
      invalid();
      return;
    }
    let start = match[1] ? Number(match[1]) : Number.NaN;
    let end = match[2] ? Number(match[2]) : Number.NaN;
    if (Number.isNaN(start)) {
      const suffix = end;
      if (!suffix) {
        invalid();
        return;
      }
      start = Math.max(total - suffix, 0);
      end = total - 1;
    } else if (Number.isNaN(end) || end >= total) {
      end = total - 1;
    }
    if (start >= total || start > end) {
      invalid();
      return;
    }
    const chunk = file.data.subarray(start, end + 1);
    res.status(206);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', String(chunk.length));
    res.end(chunk);
    return;
  }

  if (inline && file.mimeType.toLowerCase().startsWith('video/')) {
    res.setHeader('Accept-Ranges', 'bytes');
  }
  res.setHeader('Content-Length', String(total));
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
    @Query('view') view: string | undefined,
    @Res() res: Response,
  ) {
    sendDocument(res, await this.documents.filePayload(projectId, id), {
      inline: view === '1',
    });
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
