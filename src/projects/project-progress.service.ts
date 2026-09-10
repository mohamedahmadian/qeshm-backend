import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseIsoDate, toIsoDateOnly } from '../common/iso-date';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import {
  Prisma,
  ProjectProgressProcessingMode,
  ProjectProgressTranscriptionStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectProgressDto } from './dto/create-project-progress.dto';
import { FindProjectProgressQueryDto } from './dto/find-project-progress-query.dto';
import { UpdateProjectProgressDto } from './dto/update-project-progress.dto';
import { ProgressTranscriptionService } from './progress-transcription.service';

const audioSelect = {
  id: true,
  mimeType: true,
  byteSize: true,
  originalName: true,
  durationMs: true,
} satisfies Prisma.StoredFileSelect;

const entrySelect = {
  id: true,
  projectId: true,
  occurredAt: true,
  body: true,
  transcript: true,
  summary: true,
  progressPercent: true,
  processingMode: true,
  transcriptionStatus: true,
  transcriptionError: true,
  audioId: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, systemName: true } },
  audio: { select: audioSelect },
  images: {
    orderBy: { sortOrder: 'asc' },
    select: { id: true, imageId: true, sortOrder: true },
  },
} satisfies Prisma.ProjectProgressEntrySelect;

function serializeEntry<T extends { occurredAt: Date }>(item: T) {
  return {
    ...item,
    occurredAt: toIsoDateOnly(item.occurredAt),
  };
}

@Injectable()
export class ProjectProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transcription: ProgressTranscriptionService,
  ) {}

  async findAll(projectId: string, query: FindProjectProgressQueryDto) {
    await this.assertProject(projectId);
    const where: Prisma.ProjectProgressEntryWhereInput = {
      projectId,
      transcriptionStatus: query.transcriptionStatus,
      OR: query.q
        ? [
            { body: containsInsensitive(query.q) },
            { transcript: containsInsensitive(query.q) },
            { summary: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ProjectProgressEntryOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        occurredAt: (dir) => ({ occurredAt: dir }),
        body: (dir) => ({ body: dir }),
        progressPercent: (dir) => ({ progressPercent: dir }),
        transcriptionStatus: (dir) => ({ transcriptionStatus: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.projectProgressEntry.findMany({
        where,
        orderBy,
        select: entrySelect,
      });
      return items.map(serializeEntry);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectProgressEntry.findMany({
        where,
        orderBy,
        skip,
        take,
        select: entrySelect,
      }),
      this.prisma.projectProgressEntry.count({ where }),
    ]);
    return paginatedResult(items.map(serializeEntry), total, page, pageSize);
  }

  async findOne(projectId: string, id: string) {
    await this.assertProject(projectId);
    const entry = await this.prisma.projectProgressEntry.findFirst({
      where: { id, projectId },
      select: entrySelect,
    });
    if (!entry) {
      throw new NotFoundException('ثبت پیشرفت یافت نشد');
    }
    return serializeEntry(entry);
  }

  async create(projectId: string, dto: CreateProjectProgressDto) {
    await this.assertProject(projectId);
    const imageIds = uniqueIds(dto.imageIds);
    await this.assertImages(imageIds);
    await this.assertAudio(dto.audioId);
    this.assertHasContent(dto.body, dto.transcript, dto.audioId, imageIds);

    const processingMode = dto.processingMode ?? ProjectProgressProcessingMode.DEFERRED;
    const transcriptionStatus = resolveCreateStatus(
      processingMode,
      dto.body,
      dto.transcript,
      dto.audioId,
    );

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectProgressEntry.create({
        data: {
          projectId,
          occurredAt: parseIsoDate(dto.occurredAt),
          body: dto.body ?? null,
          transcript: dto.transcript ?? null,
          progressPercent: dto.progressPercent ?? null,
          processingMode,
          transcriptionStatus,
          audioId: dto.audioId ?? null,
          images: {
            create: imageIds.map((imageId, index) => ({
              imageId,
              sortOrder: index,
            })),
          },
        },
        select: entrySelect,
      });
      if (dto.progressPercent != null) {
        await tx.project.update({
          where: { id: projectId },
          data: { progressPercent: dto.progressPercent },
        });
      }
      return created;
    });

    await this.maybeTranscribe(entry.id, processingMode, transcriptionStatus);
    return this.findOne(projectId, entry.id);
  }

  async update(projectId: string, id: string, dto: UpdateProjectProgressDto) {
    const current = await this.findOne(projectId, id);
    const imageIds = dto.imageIds === undefined ? undefined : uniqueIds(dto.imageIds);
    if (imageIds) {
      await this.assertImages(imageIds);
    }
    if (dto.audioId !== undefined) {
      await this.assertAudio(dto.audioId);
    }

    const nextBody = dto.body === undefined ? current.body : dto.body;
    const nextTranscript = dto.transcript === undefined ? current.transcript : dto.transcript;
    const nextAudioId = dto.audioId === undefined ? current.audioId : dto.audioId;
    const nextImages = imageIds ?? current.images.map((item) => item.imageId);
    this.assertHasContent(nextBody, nextTranscript, nextAudioId, nextImages);

    const processingMode = dto.processingMode ?? current.processingMode;
    const audioChanged = dto.audioId !== undefined && dto.audioId !== current.audioId;
    const transcriptionStatus = audioChanged
      ? resolveCreateStatus(processingMode, nextBody, nextTranscript, nextAudioId)
      : current.transcriptionStatus;

    const previousAudioId = current.audioId;
    await this.prisma.$transaction(async (tx) => {
      if (imageIds) {
        await tx.projectProgressImage.deleteMany({ where: { entryId: id } });
      }
      await tx.projectProgressEntry.update({
        where: { id },
        data: {
          occurredAt:
            dto.occurredAt === undefined
              ? undefined
              : (parseIsoDate(dto.occurredAt) ?? undefined),
          body: dto.body === undefined ? undefined : dto.body,
          transcript: dto.transcript === undefined ? undefined : dto.transcript,
          progressPercent:
            dto.progressPercent === undefined ? undefined : dto.progressPercent,
          processingMode: dto.processingMode,
          transcriptionStatus,
          transcriptionError: audioChanged ? null : undefined,
          audioId: dto.audioId === undefined ? undefined : dto.audioId,
          images: imageIds
            ? {
                create: imageIds.map((imageId, index) => ({
                  imageId,
                  sortOrder: index,
                })),
              }
            : undefined,
        },
      });
      if (dto.progressPercent != null) {
        await tx.project.update({
          where: { id: projectId },
          data: { progressPercent: dto.progressPercent },
        });
      }
    });

    if (audioChanged && previousAudioId && previousAudioId !== nextAudioId) {
      await this.prisma.storedFile.delete({ where: { id: previousAudioId } }).catch(() => undefined);
    }
    if (audioChanged) {
      await this.maybeTranscribe(id, processingMode, transcriptionStatus);
    }
    return this.findOne(projectId, id);
  }

  async remove(projectId: string, id: string) {
    const entry = await this.findOne(projectId, id);
    const imageIds = entry.images.map((item) => item.imageId);
    await this.prisma.$transaction(async (tx) => {
      await tx.projectProgressImage.deleteMany({ where: { entryId: id } });
      await tx.projectProgressEntry.delete({ where: { id } });
      if (entry.audioId) {
        await tx.storedFile.delete({ where: { id: entry.audioId } }).catch(() => undefined);
      }
      if (imageIds.length) {
        await tx.storedImage.deleteMany({
          where: {
            id: { in: imageIds },
            progressImages: { none: {} },
            photoUsers: { none: {} },
            nationalCardUsers: { none: {} },
            passportUsers: { none: {} },
            identityBookletUsers: { none: {} },
            foodPhotos: { none: {} },
            restaurantLogos: { none: {} },
          },
        });
      }
    });
    return { ok: true };
  }

  async process(projectId: string, id: string) {
    await this.findOne(projectId, id);
    await this.transcription.process(id);
    return this.findOne(projectId, id);
  }

  private async maybeTranscribe(
    entryId: string,
    mode: ProjectProgressProcessingMode,
    status: ProjectProgressTranscriptionStatus,
  ) {
    if (status !== ProjectProgressTranscriptionStatus.PENDING) {
      return;
    }
    if (mode === ProjectProgressProcessingMode.IMMEDIATE) {
      await this.transcription.process(entryId);
      return;
    }
    this.transcription.queue(entryId);
  }

  private assertHasContent(
    body?: string | null,
    transcript?: string | null,
    audioId?: string | null,
    imageIds: string[] = [],
  ) {
    if (body?.trim() || transcript?.trim() || audioId || imageIds.length) {
      return;
    }
    throw new BadRequestException('حداقل متن، صوت یا تصویر لازم است');
  }

  private async assertImages(imageIds: string[]) {
    if (!imageIds.length) {
      return;
    }
    const count = await this.prisma.storedImage.count({
      where: { id: { in: imageIds } },
    });
    if (count !== imageIds.length) {
      throw new BadRequestException('تصویر پیوست‌شده معتبر نیست');
    }
  }

  private async assertAudio(audioId?: string | null) {
    if (!audioId) {
      return;
    }
    const file = await this.prisma.storedFile.findUnique({
      where: { id: audioId },
      select: { id: true },
    });
    if (!file) {
      throw new BadRequestException('فایل صوتی معتبر نیست');
    }
  }

  private async assertProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('پروژه یافت نشد');
    }
  }
}

function uniqueIds(ids?: string[]) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

function resolveCreateStatus(
  mode: ProjectProgressProcessingMode,
  body?: string | null,
  transcript?: string | null,
  audioId?: string | null,
): ProjectProgressTranscriptionStatus {
  if (transcript?.trim() || (mode === ProjectProgressProcessingMode.IMMEDIATE && body?.trim())) {
    return audioId
      ? ProjectProgressTranscriptionStatus.READY
      : ProjectProgressTranscriptionStatus.NONE;
  }
  if (audioId) {
    return ProjectProgressTranscriptionStatus.PENDING;
  }
  return ProjectProgressTranscriptionStatus.NONE;
}
