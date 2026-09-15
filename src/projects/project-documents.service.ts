import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDocumentDto } from './dto/create-project-document.dto';
import { FindProjectDocumentsQueryDto } from './dto/find-project-documents-query.dto';
import { UpdateProjectDocumentDto } from './dto/update-project-document.dto';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const DOCUMENT_MIME_TYPES = new Map([
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

type UploadedDocument = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

const documentSelect = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  originalName: true,
  mimeType: true,
  byteSize: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: { id: true, systemName: true },
  },
} satisfies Prisma.ProjectDocumentSelect;

function uploadsRoot() {
  const fromEnv = process.env.UPLOADS_DIR?.trim();
  return resolve(fromEnv || join(process.cwd(), 'uploads'));
}

function fileExtension(name?: string) {
  const match = name?.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function normalizeDocumentType(mime: string | undefined, originalName?: string) {
  const ext = fileExtension(originalName);
  const fromExt = DOCUMENT_MIME_TYPES.get(ext);
  if (fromExt) return fromExt;
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  for (const type of DOCUMENT_MIME_TYPES.values()) {
    if (base === type) return type;
  }
  return null;
}

function originalFileName(name?: string) {
  const trimmed = name?.trim() || 'document';
  return trimmed.slice(0, 200);
}

@Injectable()
export class ProjectDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string, query: FindProjectDocumentsQueryDto) {
    await this.assertProject(projectId);
    const where: Prisma.ProjectDocumentWhereInput = {
      projectId,
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
            { originalName: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ProjectDocumentOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        originalName: (dir) => ({ originalName: dir }),
        byteSize: (dir) => ({ byteSize: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.projectDocument.findMany({
        where,
        orderBy,
        select: documentSelect,
      });
      return items;
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectDocument.findMany({
        where,
        orderBy,
        skip,
        take,
        select: documentSelect,
      }),
      this.prisma.projectDocument.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(projectId: string, id: string) {
    await this.assertProject(projectId);
    const item = await this.prisma.projectDocument.findFirst({
      where: { id, projectId },
      select: documentSelect,
    });
    if (!item) {
      throw new NotFoundException('پیوست یافت نشد');
    }
    return item;
  }

  async create(
    projectId: string,
    dto: CreateProjectDocumentDto,
    file?: UploadedDocument,
  ) {
    await this.assertProject(projectId);
    const stored = this.assertFile(file);
    const saved = await this.writeFile(projectId, stored);
    try {
      return await this.prisma.projectDocument.create({
        data: {
          projectId,
          title: dto.title,
          description: dto.description ?? null,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          byteSize: stored.size,
          storageKey: saved.storageKey,
        },
        select: documentSelect,
      });
    } catch (error) {
      await this.removeFile(saved.storageKey);
      throw error;
    }
  }

  async update(
    projectId: string,
    id: string,
    dto: UpdateProjectDocumentDto,
    file?: UploadedDocument,
  ) {
    const current = await this.record(projectId, id);
    let nextFile:
      | {
          originalName: string;
          mimeType: string;
          byteSize: number;
          storageKey: string;
        }
      | undefined;
    if (file?.buffer) {
      const stored = this.assertFile(file);
      const saved = await this.writeFile(projectId, stored);
      nextFile = {
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        byteSize: stored.size,
        storageKey: saved.storageKey,
      };
    }
    try {
      const updated = await this.prisma.projectDocument.update({
        where: { id: current.id },
        data: {
          title: dto.title,
          description: dto.description,
          ...(nextFile
            ? {
                originalName: nextFile.originalName,
                mimeType: nextFile.mimeType,
                byteSize: nextFile.byteSize,
                storageKey: nextFile.storageKey,
              }
            : {}),
        },
        select: documentSelect,
      });
      if (nextFile) {
        await this.removeFile(current.storageKey);
      }
      return updated;
    } catch (error) {
      if (nextFile) await this.removeFile(nextFile.storageKey);
      throw error;
    }
  }

  async remove(projectId: string, id: string) {
    const current = await this.record(projectId, id);
    await this.prisma.projectDocument.delete({ where: { id: current.id } });
    await this.removeFile(current.storageKey);
    return { ok: true };
  }

  async filePayload(projectId: string, id: string) {
    const current = await this.record(projectId, id);
    const abs = this.absolutePath(current.storageKey);
    const data = await readFile(abs);
    return {
      data,
      mimeType: current.mimeType,
      originalName: current.originalName,
    };
  }

  async removeProjectFiles(projectId: string) {
    const dir = join(uploadsRoot(), 'project-documents', projectId);
    await rm(dir, { recursive: true, force: true });
  }

  private async record(projectId: string, id: string) {
    await this.assertProject(projectId);
    const item = await this.prisma.projectDocument.findFirst({
      where: { id, projectId },
    });
    if (!item) {
      throw new NotFoundException('پیوست یافت نشد');
    }
    return item;
  }

  private assertFile(file?: UploadedDocument) {
    if (!file?.buffer) {
      throw new BadRequestException('فایل ارسال نشده است');
    }
    const mimeType = normalizeDocumentType(file.mimetype, file.originalname);
    if (!mimeType) {
      throw new BadRequestException('فقط فایل PDF یا Word مجاز است');
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است');
    }
    return {
      buffer: file.buffer,
      size: file.size,
      mimeType,
      originalName: originalFileName(file.originalname),
    };
  }

  private async writeFile(
    projectId: string,
    file: {
      buffer: Buffer;
      mimeType: string;
      originalName: string;
      size: number;
    },
  ) {
    const ext = extname(file.originalName).toLowerCase() || '.bin';
    const storageKey = ['project-documents', projectId, `${randomUUID()}${ext}`].join('/');
    const abs = this.absolutePath(storageKey);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, file.buffer);
    return { storageKey };
  }

  private absolutePath(storageKey: string) {
    const root = uploadsRoot();
    const abs = resolve(root, storageKey);
    const rel = relative(root, abs);
    if (!rel || rel.startsWith('..') || rel.split(/[\\/]/).includes('..')) {
      throw new BadRequestException('مسیر فایل نامعتبر است');
    }
    if (!abs.startsWith(root + sep) && abs !== root) {
      throw new BadRequestException('مسیر فایل نامعتبر است');
    }
    return abs;
  }

  private async removeFile(storageKey: string) {
    try {
      await unlink(this.absolutePath(storageKey));
    } catch {
      // missing file on disk should not block DB cleanup
    }
  }

  private async assertProject(projectId: string) {
    const exists = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('پروژه یافت نشد');
    }
  }
}
