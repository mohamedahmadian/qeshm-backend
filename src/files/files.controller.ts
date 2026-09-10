import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { FilesService } from './files.service';

type AudioUpload = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: AudioUpload,
    @Body('durationMs') durationMs?: string,
  ) {
    const parsed = durationMs != null && durationMs !== '' ? Number(durationMs) : null;
    return this.files.store(
      file,
      Number.isFinite(parsed) && parsed != null && parsed >= 0 ? Math.round(parsed) : null,
    );
  }

  @Get(':id')
  async get(@Param('id') id: string, @Res() res: Response) {
    const file = await this.files.find(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const name = file.originalName?.trim() || 'audio';
    const ascii = name.replace(/[^\w.\-]+/g, '_') || 'audio';
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    res.send(Buffer.from(file.data));
  }
}
