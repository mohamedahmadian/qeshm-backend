import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const ALLOWED_PREFIX = 'audio/';

type FileUpload = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async store(file: FileUpload, durationMs?: number | null) {
    if (!file?.buffer) {
      throw new BadRequestException('فایل صوتی ارسال نشده است');
    }
    if (file.size > MAX_INPUT_BYTES) {
      throw new BadRequestException('حجم فایل صوتی بیش از حد مجاز است');
    }
    if (!file.mimetype?.startsWith(ALLOWED_PREFIX)) {
      throw new BadRequestException('فقط فایل صوتی مجاز است');
    }

    return this.prisma.storedFile.create({
      data: {
        mimeType: file.mimetype,
        data: Buffer.from(file.buffer),
        byteSize: file.size,
        originalName: file.originalname?.trim() || 'audio',
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
