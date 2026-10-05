import { QeshmondiSyncSource, QeshmondiSyncStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function openQeshmondiSyncLog(
  prisma: PrismaService,
  input: { source: QeshmondiSyncSource; actorId?: string | null },
) {
  return prisma.qeshmondiSyncLog.create({
    data: {
      source: input.source,
      status: QeshmondiSyncStatus.RUNNING,
      actorId: input.actorId || null,
    },
    select: { id: true },
  });
}

export async function finishQeshmondiSyncLog(
  prisma: PrismaService,
  id: string,
  input: {
    status: QeshmondiSyncStatus;
    createdCount?: number;
    updatedCount?: number;
    failedCount?: number;
    errorMessage?: string | null;
  },
) {
  await prisma.qeshmondiSyncLog.update({
    where: { id },
    data: {
      status: input.status,
      finishedAt: new Date(),
      createdCount: input.createdCount ?? 0,
      updatedCount: input.updatedCount ?? 0,
      failedCount: input.failedCount ?? 0,
      errorMessage: input.errorMessage?.trim() ? input.errorMessage.trim() : null,
    },
  });
}
