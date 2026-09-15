import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

type FileUpload = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

export function normalizeMediaType(mime: string | undefined) {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  if (base.startsWith('audio/') || base.startsWith('video/')) {
    return base;
  }
  return 'application/octet-stream';
}

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
]);

const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'rtf',
  'zip',
  'txt',
  'csv',
]);

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function fileExtension(name?: string) {
  const match = name?.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

export function normalizeDocumentType(mime: string | undefined, originalName?: string) {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  if (DOCUMENT_MIME_TYPES.has(base)) {
    return base;
  }
  const ext = fileExtension(originalName);
  if (DOCUMENT_EXTENSIONS.has(ext)) {
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'txt') return 'text/plain';
    if (ext === 'csv') return 'text/csv';
    return 'application/octet-stream';
  }
  return null;
}

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async storeDocument(file: FileUpload) {
    if (!file?.buffer) {
      throw new BadRequestException('فایل ارسال نشده است');
    }
    const mimeType = normalizeDocumentType(file.mimetype, file.originalname);
    if (!mimeType) {
      throw new BadRequestException('این نوع فایل مجاز نیست');
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است');
    }
    return this.prisma.storedFile.create({
      data: {
        mimeType,
        data: Buffer.from(file.buffer),
        byteSize: file.size,
        originalName: file.originalname?.trim() || 'document',
      },
      select: {
        id: true,
        mimeType: true,
        byteSize: true,
        originalName: true,
      },
    });
  }

  async store(file: FileUpload, durationMs?: number | null) {
    if (!file?.buffer) {
      throw new BadRequestException('فایل ارسال نشده است');
    }
    const mimeType = normalizeMediaType(file.mimetype);
    const isAudio = mimeType.startsWith('audio/');
    const isVideo = mimeType.startsWith('video/');
    if (!isAudio && !isVideo) {
      throw new BadRequestException('فقط فایل صوتی یا ویدیو مجاز است');
    }
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_AUDIO_BYTES;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        isVideo ? 'حجم ویدیو بیش از حد مجاز است' : 'حجم فایل صوتی بیش از حد مجاز است',
      );
    }

    return this.prisma.storedFile.create({
      data: {
        mimeType,
        data: Buffer.from(file.buffer),
        byteSize: file.size,
        originalName: file.originalname?.trim() || (file.mimetype.startsWith('video/') ? 'video' : 'audio'),
        durationMs: durationMs ?? null,
      },
      select: {
        id: true,
        mimeType: true,
        byteSize: true,
        originalName: true,
        durationMs: true,
      },
    });
  }

  async find(id: string) {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) {
      throw new NotFoundException();
    }
    return file;
  }

  async remove(id: string) {
    await this.prisma.storedFile.delete({ where: { id } }).catch(() => undefined);
  }
}
