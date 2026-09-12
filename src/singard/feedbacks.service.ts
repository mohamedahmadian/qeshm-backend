import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { toLatinDigits } from '../common/national-id';
import { normalizeMobile, normalizePhone, phoneLookupValues } from '../common/phone';
import { resolveSortOrder } from '../common/sort-query';
import {
  Prisma,
  SingardAttachmentKind,
  SingardFeedbackStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { joinFullName } from '../users/user-profile.util';
import { CreateSingardActivityDto } from './dto/create-activity.dto';
import { CreateSingardFeedbackDto } from './dto/create-feedback.dto';
import { FindSingardFeedbacksQueryDto } from './dto/find-feedbacks-query.dto';
import { ReplySingardFeedbackDto } from './dto/reply-feedback.dto';
import { UpdateSingardActivityDto } from './dto/update-activity.dto';
import { UpdateSingardFeedbackStatusDto } from './dto/update-feedback-status.dto';
import {
  SINGARD_CITIZEN_ROLE_CODE,
  SINGARD_DEFAULT_PASSWORD,
} from './singard.constants';

const categorySelect = {
  id: true,
  name: true,
  parentId: true,
  parent: { select: { id: true, name: true } },
} satisfies Prisma.SingardCategorySelect;

const userBrief = {
  id: true,
  firstName: true,
  lastName: true,
  fullName: true,
  phone: true,
} satisfies Prisma.UserSelect;

const attachmentSelect = {
  id: true,
  kind: true,
  imageId: true,
  fileId: true,
  sortOrder: true,
  createdAt: true,
  file: {
    select: { id: true, mimeType: true, byteSize: true, originalName: true, durationMs: true },
  },
} satisfies Prisma.SingardAttachmentSelect;

const activitySelect = {
  id: true,
  feedbackId: true,
  kind: true,
  occurredAt: true,
  title: true,
  body: true,
  createdById: true,
  createdBy: { select: { id: true, fullName: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SingardActivitySelect;

const feedbackListSelect = {
  id: true,
  trackingCode: true,
  kind: true,
  status: true,
  categoryId: true,
  category: { select: categorySelect },
  userId: true,
  isAnonymous: true,
  firstName: true,
  lastName: true,
  phone: true,
  body: true,
  address: true,
  latitude: true,
  longitude: true,
  repliedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { attachments: true, activities: true } },
} satisfies Prisma.SingardFeedbackSelect;

const feedbackDetailSelect = {
  ...feedbackListSelect,
  replyBody: true,
  repliedById: true,
  repliedBy: { select: userBrief },
  user: { select: userBrief },
  attachments: { orderBy: { sortOrder: 'asc' }, select: attachmentSelect },
  activities: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], select: activitySelect },
} satisfies Prisma.SingardFeedbackSelect;

function submitterName(item: {
  isAnonymous: boolean;
  firstName: string | null;
  lastName: string | null;
}) {
  if (item.isAnonymous) return null;
  return joinFullName(item.firstName ?? '', item.lastName ?? '') || null;
}

function toCoord(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value);
}

function toDecimal(value: number | null | undefined) {
  return value == null ? null : new Prisma.Decimal(value);
}

function mapFeedback<
  T extends {
    firstName: string | null;
    lastName: string | null;
    isAnonymous: boolean;
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
  },
>(item: T) {
  return {
    ...item,
    latitude: toCoord(item.latitude),
    longitude: toCoord(item.longitude),
    submitterName: submitterName(item),
  };
}

function trackingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let code = 'SG';
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }
  return code;
}

@Injectable()
export class SingardFeedbacksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindSingardFeedbacksQueryDto, onlyUserId?: string) {
    const where = this.listWhere(query, onlyUserId);
    const orderBy = resolveSortOrder<Prisma.SingardFeedbackOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        trackingCode: (dir) => ({ trackingCode: dir }),
        kind: (dir) => ({ kind: dir }),
        status: (dir) => ({ status: dir }),
        category: (dir) => ({ category: { name: dir } }),
        submitter: (dir) => [{ lastName: dir }, { firstName: dir }],
        phone: (dir) => ({ phone: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.singardFeedback.findMany({
        where,
        orderBy,
        select: feedbackListSelect,
      });
      return items.map(mapFeedback);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.singardFeedback.findMany({
        where,
        orderBy,
        skip,
        take,
        select: feedbackListSelect,
      }),
      this.prisma.singardFeedback.count({ where }),
    ]);
    return paginatedResult(items.map(mapFeedback), total, page, pageSize);
  }

  async findOne(id: string, onlyUserId?: string) {
    const feedback = await this.prisma.singardFeedback.findUnique({
      where: { id },
      select: feedbackDetailSelect,
    });
    if (!feedback) {
      throw new NotFoundException('نظر پیدا نشد');
    }
    if (onlyUserId && feedback.userId !== onlyUserId) {
      throw new ForbiddenException();
    }
    return mapFeedback(feedback);
  }

  async create(dto: CreateSingardFeedbackDto, actorUserId?: string) {
    await this.assertLeafOrExistingCategory(dto.categoryId);
    const imageIds = dto.imageIds ?? [];
    const audioIds = dto.audioIds ?? [];
    const videoIds = dto.videoIds ?? [];
    if (!dto.body?.trim() && !imageIds.length && !audioIds.length && !videoIds.length) {
      throw new BadRequestException('لطفاً متن، عکس، صدا یا فیلم بگذارید');
    }
    this.assertCoordinates(dto.latitude, dto.longitude);
    await this.assertImages(imageIds);
    await this.assertFiles(audioIds, 'audio');
    await this.assertFiles(videoIds, 'video');

    let userId = actorUserId ?? null;
    let isAnonymous = !actorUserId;
    let firstName = dto.firstName?.trim() || null;
    let lastName = dto.lastName?.trim() || null;
    let phone = dto.phone ? normalizeMobile(dto.phone) || normalizePhone(dto.phone) : null;

    if (actorUserId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { firstName: true, lastName: true, phone: true },
      });
      isAnonymous = false;
      firstName = actor?.firstName ?? firstName;
      lastName = actor?.lastName ?? lastName;
      phone = actor?.phone ?? phone;
    } else if (dto.introduce) {
      if (!firstName || !lastName || !phone) {
        throw new BadRequestException('برای معرفی خود، نام، نام خانوادگی و تلفن همراه لازم است');
      }
      const user = await this.findOrCreateCitizen(firstName, lastName, phone);
      userId = user.id;
      isAnonymous = false;
      phone = user.phone ?? phone;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await this.insertWithCode(tx, {
        kind: dto.kind,
        categoryId: dto.categoryId,
        userId,
        isAnonymous,
        firstName,
        lastName,
        phone,
        body: dto.body?.trim() || null,
        address: dto.address?.trim() || null,
        latitude: toDecimal(dto.latitude),
        longitude: toDecimal(dto.longitude),
      });
      const attachments: Prisma.SingardAttachmentCreateManyInput[] = [
        ...imageIds.map((imageId, index) => ({
          feedbackId: row.id,
          kind: SingardAttachmentKind.IMAGE,
          imageId,
          sortOrder: index,
        })),
        ...audioIds.map((fileId, index) => ({
          feedbackId: row.id,
          kind: SingardAttachmentKind.AUDIO,
          fileId,
          sortOrder: imageIds.length + index,
        })),
        ...videoIds.map((fileId, index) => ({
          feedbackId: row.id,
          kind: SingardAttachmentKind.VIDEO,
          fileId,
          sortOrder: imageIds.length + audioIds.length + index,
        })),
      ];
      if (attachments.length) {
        await tx.singardAttachment.createMany({ data: attachments });
      }
      return row.id;
    });

    return this.findOne(created);
  }

  async updateStatus(id: string, dto: UpdateSingardFeedbackStatusDto) {
    await this.findOne(id);
    const updated = await this.prisma.singardFeedback.update({
      where: { id },
      data: { status: dto.status },
      select: feedbackDetailSelect,
    });
    return mapFeedback(updated);
  }

  async reply(id: string, dto: ReplySingardFeedbackDto, actorUserId: string) {
    await this.findOne(id);
    const updated = await this.prisma.singardFeedback.update({
      where: { id },
      data: {
        replyBody: dto.replyBody,
        repliedAt: new Date(),
        repliedById: actorUserId,
        status: SingardFeedbackStatus.ANSWERED,
      },
      select: feedbackDetailSelect,
    });
    return mapFeedback(updated);
  }

  async createActivity(feedbackId: string, dto: CreateSingardActivityDto, actorUserId: string) {
    const feedback = await this.findOne(feedbackId);
    const activity = await this.prisma.singardActivity.create({
      data: {
        feedbackId,
        kind: dto.kind ?? 'NOTE',
        occurredAt: new Date(`${dto.occurredAt}T00:00:00.000Z`),
        title: dto.title,
        body: dto.body ?? null,
        createdById: actorUserId,
      },
      select: activitySelect,
    });
    if (feedback.status === 'NEW') {
      await this.prisma.singardFeedback.update({
        where: { id: feedbackId },
        data: { status: SingardFeedbackStatus.IN_PROGRESS },
      });
    }
    return activity;
  }

  async findActivity(feedbackId: string, activityId: string) {
    const activity = await this.prisma.singardActivity.findFirst({
      where: { id: activityId, feedbackId },
      select: activitySelect,
    });
    if (!activity) {
      throw new NotFoundException('فعالیت پیدا نشد');
    }
    return activity;
  }

  async updateActivity(feedbackId: string, activityId: string, dto: UpdateSingardActivityDto) {
    await this.findActivity(feedbackId, activityId);
    return this.prisma.singardActivity.update({
      where: { id: activityId },
      data: {
        kind: dto.kind,
        occurredAt: dto.occurredAt ? new Date(`${dto.occurredAt}T00:00:00.000Z`) : undefined,
        title: dto.title,
        body: dto.body,
      },
      select: activitySelect,
    });
  }

  async removeActivity(feedbackId: string, activityId: string) {
    await this.findActivity(feedbackId, activityId);
    await this.prisma.singardActivity.delete({ where: { id: activityId } });
    return { ok: true };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.singardFeedback.delete({ where: { id } });
    return { ok: true };
  }

  async reports(query: FindSingardFeedbacksQueryDto) {
    const where = this.listWhere(query);
    const [total, byKind, byStatus, byCategory] = await Promise.all([
      this.prisma.singardFeedback.count({ where }),
      this.prisma.singardFeedback.groupBy({
        by: ['kind'],
        where,
        _count: { _all: true },
      }),
      this.prisma.singardFeedback.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.singardFeedback.groupBy({
        by: ['categoryId'],
        where,
        _count: { _all: true },
      }),
    ]);
    const categories = await this.prisma.singardCategory.findMany({
      where: { id: { in: byCategory.map((row) => row.categoryId) } },
      select: { id: true, name: true },
    });
    const categoryName = new Map(categories.map((item) => [item.id, item.name]));
    const answered = byStatus.find((row) => row.status === 'ANSWERED')?._count._all ?? 0;
    const pending = byStatus
      .filter((row) => row.status === 'NEW' || row.status === 'IN_PROGRESS')
      .reduce((sum, row) => sum + row._count._all, 0);
    return {
      kpis: {
        total,
        pending,
        answered,
        closed: byStatus.find((row) => row.status === 'CLOSED')?._count._all ?? 0,
        suggestions: byKind.find((row) => row.kind === 'SUGGESTION')?._count._all ?? 0,
        complaints: byKind.find((row) => row.kind === 'COMPLAINT')?._count._all ?? 0,
        criticisms: byKind.find((row) => row.kind === 'CRITICISM')?._count._all ?? 0,
        reports: byKind.find((row) => row.kind === 'REPORT')?._count._all ?? 0,
      },
      byKind: byKind.map((row) => ({ key: row.kind, count: row._count._all })),
      byStatus: byStatus.map((row) => ({ key: row.status, count: row._count._all })),
      byCategory: byCategory.map((row) => ({
        id: row.categoryId,
        name: categoryName.get(row.categoryId) ?? row.categoryId,
        count: row._count._all,
      })),
    };
  }

  private listWhere(query: FindSingardFeedbacksQueryDto, onlyUserId?: string) {
    const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined;
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;
    const where: Prisma.SingardFeedbackWhereInput = {
      userId: onlyUserId,
      kind: query.kind,
      status: query.status,
      categoryId: query.categoryId,
      createdAt: from || to ? { gte: from, lte: to } : undefined,
      OR: query.q
        ? [
            { trackingCode: containsInsensitive(query.q) },
            { firstName: containsInsensitive(query.q) },
            { lastName: containsInsensitive(query.q) },
            { phone: containsInsensitive(query.q) },
            { body: containsInsensitive(query.q) },
            { address: containsInsensitive(query.q) },
            { category: { name: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    return where;
  }

  private async insertWithCode(
    tx: Prisma.TransactionClient,
    data: {
      kind: CreateSingardFeedbackDto['kind'];
      categoryId: string;
      userId: string | null;
      isAnonymous: boolean;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      body: string | null;
      address: string | null;
      latitude: Prisma.Decimal | null;
      longitude: Prisma.Decimal | null;
    },
  ) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = trackingCode();
      try {
        return await tx.singardFeedback.create({
          data: { ...data, trackingCode: code },
          select: { id: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException('کد پیگیری ساخته نشد. دوباره تلاش کنید');
  }

  private async findOrCreateCitizen(firstName: string, lastName: string, phone: string) {
    const lookups = phoneLookupValues(phone);
    const existing = lookups.length
      ? await this.prisma.user.findFirst({
          where: { OR: lookups.map((value) => ({ phone: value })) },
          select: { id: true, phone: true },
        })
      : null;
    if (existing) {
      return existing;
    }
    const usernameBase = toLatinDigits(phone);
    let username = usernameBase;
    for (let i = 0; i < 5; i += 1) {
      const taken = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (!taken) break;
      username = `${usernameBase}_${i + 1}`;
    }
    const passwordHash = await bcrypt.hash(SINGARD_DEFAULT_PASSWORD, 10);
    const citizenRole = await this.prisma.role.findUnique({
      where: { code: SINGARD_CITIZEN_ROLE_CODE },
      select: { id: true },
    });
    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        firstName,
        lastName,
        fullName: joinFullName(firstName, lastName),
        phone,
        locale: 'fa',
        status: 'ACTIVE',
      },
      select: { id: true, phone: true },
    });
    if (citizenRole) {
      await this.prisma.userRole.create({
        data: { userId: user.id, roleId: citizenRole.id },
      });
    }
    return user;
  }

  private assertCoordinates(latitude?: number | null, longitude?: number | null) {
    if ((latitude == null) !== (longitude == null)) {
      throw new BadRequestException('موقعیت مکانی باید هر دو مختصات را داشته باشد');
    }
  }

  private async assertLeafOrExistingCategory(categoryId: string) {
    const category = await this.prisma.singardCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, isActive: true },
    });
    if (!category || !category.isActive) {
      throw new BadRequestException('دسته‌بندی معتبر نیست');
    }
  }

  private async assertImages(ids: string[]) {
    if (!ids.length) return;
    const count = await this.prisma.storedImage.count({
      where: { id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new BadRequestException('یکی از تصاویر معتبر نیست');
    }
  }

  private async assertFiles(ids: string[], kind: 'audio' | 'video') {
    if (!ids.length) return;
    const files = await this.prisma.storedFile.findMany({
      where: { id: { in: ids } },
      select: { id: true, mimeType: true },
    });
    if (files.length !== ids.length) {
      throw new BadRequestException(kind === 'audio' ? 'فایل صوتی معتبر نیست' : 'فایل ویدیو معتبر نیست');
    }
    const prefix = kind === 'audio' ? 'audio/' : 'video/';
    if (files.some((file) => !file.mimeType.startsWith(prefix))) {
      throw new BadRequestException(kind === 'audio' ? 'فقط فایل صوتی مجاز است' : 'فقط فایل ویدیو مجاز است');
    }
  }
}