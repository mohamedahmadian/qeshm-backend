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
  InspectionAttachmentKind,
  InspectionFeedbackStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { joinFullName } from '../users/user-profile.util';
import { CreateInspectionActivityDto } from './dto/create-activity.dto';
import { CreateInspectionFeedbackDto } from './dto/create-feedback.dto';
import { FindInspectionFeedbacksQueryDto } from './dto/find-feedbacks-query.dto';
import { ReplyInspectionFeedbackDto } from './dto/reply-feedback.dto';
import { UpdateInspectionActivityDto } from './dto/update-activity.dto';
import { UpdateInspectionFeedbackStatusDto } from './dto/update-feedback-status.dto';
import {
  INSPECTION_CITIZEN_ROLE_CODE,
  INSPECTION_DEFAULT_PASSWORD,
} from './inspection.constants';

const kindSelect = {
  id: true,
  title: true,
  description: true,
  icon: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.InspectionKindSelect;

const categorySelect = {
  id: true,
  name: true,
  parentId: true,
  parent: { select: { id: true, name: true } },
} satisfies Prisma.InspectionCategorySelect;

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
} satisfies Prisma.InspectionAttachmentSelect;

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
} satisfies Prisma.InspectionActivitySelect;

const feedbackListSelect = {
  id: true,
  trackingCode: true,
  kindId: true,
  kind: { select: kindSelect },
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
} satisfies Prisma.InspectionFeedbackSelect;

const feedbackDetailSelect = {
  ...feedbackListSelect,
  replyBody: true,
  repliedById: true,
  repliedBy: { select: userBrief },
  user: { select: userBrief },
  attachments: { orderBy: { sortOrder: 'asc' }, select: attachmentSelect },
  activities: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], select: activitySelect },
} satisfies Prisma.InspectionFeedbackSelect;

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
  let code = 'IN';
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }
  return code;
}

@Injectable()
export class InspectionFeedbacksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindInspectionFeedbacksQueryDto, onlyUserId?: string) {
    const where = this.listWhere(query, onlyUserId);
    const orderBy = resolveSortOrder<Prisma.InspectionFeedbackOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        trackingCode: (dir) => ({ trackingCode: dir }),
        kind: (dir) => ({ kind: { title: dir } }),
        status: (dir) => ({ status: dir }),
        category: (dir) => ({ category: { name: dir } }),
        submitter: (dir) => [{ lastName: dir }, { firstName: dir }],
        phone: (dir) => ({ phone: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.inspectionFeedback.findMany({
        where,
        orderBy,
        select: feedbackListSelect,
      });
      return items.map(mapFeedback);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.inspectionFeedback.findMany({
        where,
        orderBy,
        skip,
        take,
        select: feedbackListSelect,
      }),
      this.prisma.inspectionFeedback.count({ where }),
    ]);
    return paginatedResult(items.map(mapFeedback), total, page, pageSize);
  }

  async findOne(id: string, onlyUserId?: string) {
    const feedback = await this.prisma.inspectionFeedback.findUnique({
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

  async create(dto: CreateInspectionFeedbackDto, actorUserId?: string) {
    await this.assertActiveKind(dto.kindId);
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
        kindId: dto.kindId,
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
      const attachments: Prisma.InspectionAttachmentCreateManyInput[] = [
        ...imageIds.map((imageId, index) => ({
          feedbackId: row.id,
          kind: InspectionAttachmentKind.IMAGE,
          imageId,
          sortOrder: index,
        })),
        ...audioIds.map((fileId, index) => ({
          feedbackId: row.id,
          kind: InspectionAttachmentKind.AUDIO,
          fileId,
          sortOrder: imageIds.length + index,
        })),
        ...videoIds.map((fileId, index) => ({
          feedbackId: row.id,
          kind: InspectionAttachmentKind.VIDEO,
          fileId,
          sortOrder: imageIds.length + audioIds.length + index,
        })),
      ];
      if (attachments.length) {
        await tx.inspectionAttachment.createMany({ data: attachments });
      }
      return row.id;
    });

    return this.findOne(created);
  }

  async updateStatus(id: string, dto: UpdateInspectionFeedbackStatusDto) {
    await this.findOne(id);
    const updated = await this.prisma.inspectionFeedback.update({
      where: { id },
      data: { status: dto.status },
      select: feedbackDetailSelect,
    });
    return mapFeedback(updated);
  }

  async reply(id: string, dto: ReplyInspectionFeedbackDto, actorUserId: string) {
    await this.findOne(id);
    const updated = await this.prisma.inspectionFeedback.update({
      where: { id },
      data: {
        replyBody: dto.replyBody,
        repliedAt: new Date(),
        repliedById: actorUserId,
        status: InspectionFeedbackStatus.ANSWERED,
      },
      select: feedbackDetailSelect,
    });
    return mapFeedback(updated);
  }

  async createActivity(feedbackId: string, dto: CreateInspectionActivityDto, actorUserId: string) {
    const feedback = await this.findOne(feedbackId);
    const activity = await this.prisma.inspectionActivity.create({
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
      await this.prisma.inspectionFeedback.update({
        where: { id: feedbackId },
        data: { status: InspectionFeedbackStatus.IN_PROGRESS },
      });
    }
    return activity;
  }

  async findActivity(feedbackId: string, activityId: string) {
    const activity = await this.prisma.inspectionActivity.findFirst({
      where: { id: activityId, feedbackId },
      select: activitySelect,
    });
    if (!activity) {
      throw new NotFoundException('فعالیت پیدا نشد');
    }
    return activity;
  }

  async updateActivity(feedbackId: string, activityId: string, dto: UpdateInspectionActivityDto) {
    await this.findActivity(feedbackId, activityId);
    return this.prisma.inspectionActivity.update({
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
    await this.prisma.inspectionActivity.delete({ where: { id: activityId } });
    return { ok: true };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.inspectionFeedback.delete({ where: { id } });
    return { ok: true };
  }

  async reports(query: FindInspectionFeedbacksQueryDto) {
    const where = this.listWhere(query);
    const [total, byKind, byStatus, byCategory] = await Promise.all([
      this.prisma.inspectionFeedback.count({ where }),
      this.prisma.inspectionFeedback.groupBy({
        by: ['kindId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.inspectionFeedback.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.inspectionFeedback.groupBy({
        by: ['categoryId'],
        where,
        _count: { _all: true },
      }),
    ]);
    const [categories, kinds] = await Promise.all([
      this.prisma.inspectionCategory.findMany({
        where: { id: { in: byCategory.map((row) => row.categoryId) } },
        select: { id: true, name: true },
      }),
      this.prisma.inspectionKind.findMany({
        where: { id: { in: byKind.map((row) => row.kindId) } },
        select: { id: true, title: true, icon: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      }),
    ]);
    const categoryName = new Map(categories.map((item) => [item.id, item.name]));
    const kindCount = new Map(byKind.map((row) => [row.kindId, row._count._all]));
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
      },
      byKind: kinds.map((item) => ({
        id: item.id,
        title: item.title,
        icon: item.icon,
        count: kindCount.get(item.id) ?? 0,
      })),
      byStatus: byStatus.map((row) => ({ key: row.status, count: row._count._all })),
      byCategory: byCategory.map((row) => ({
        id: row.categoryId,
        name: categoryName.get(row.categoryId) ?? row.categoryId,
        count: row._count._all,
      })),
    };
  }

  private listWhere(query: FindInspectionFeedbacksQueryDto, onlyUserId?: string) {
    const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined;
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;
    const where: Prisma.InspectionFeedbackWhereInput = {
      userId: onlyUserId,
      kindId: query.kindId,
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
      kindId: string;
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
        return await tx.inspectionFeedback.create({
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
    const passwordHash = await bcrypt.hash(INSPECTION_DEFAULT_PASSWORD, 10);
    const citizenRole = await this.prisma.role.findUnique({
      where: { code: INSPECTION_CITIZEN_ROLE_CODE },
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

  private async assertActiveKind(kindId: string) {
    const kind = await this.prisma.inspectionKind.findUnique({
      where: { id: kindId },
      select: { id: true, isActive: true },
    });
    if (!kind || !kind.isActive) {
      throw new BadRequestException('نوع پیام معتبر نیست');
    }
  }

  private async assertLeafOrExistingCategory(categoryId: string) {
    const category = await this.prisma.inspectionCategory.findUnique({
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