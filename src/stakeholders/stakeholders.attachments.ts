import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export async function buildStakeholderAttachments(
  prisma: PrismaService,
  imageIds: string[] | undefined,
  fileIds: string[] | undefined,
) {
  const images = [...new Set(imageIds ?? [])];
  const files = [...new Set(fileIds ?? [])];
  if (!images.length && !files.length) {
    return [];
  }

  const storedImages = images.length
    ? await prisma.storedImage.findMany({
        where: { id: { in: images } },
        select: { id: true, originalName: true },
      })
    : [];
  if (storedImages.length !== images.length) {
    throw new BadRequestException('برخی تصاویر پیدا نشد');
  }

  const storedFiles = files.length
    ? await prisma.storedFile.findMany({
        where: { id: { in: files } },
        select: { id: true, originalName: true },
      })
    : [];
  if (storedFiles.length !== files.length) {
    throw new BadRequestException('برخی فایل‌ها پیدا نشد');
  }

  const imageById = new Map(storedImages.map((item) => [item.id, item]));
  const fileById = new Map(storedFiles.map((item) => [item.id, item]));

  return [
    ...images.map((id, index) => ({
      imageId: id,
      originalName: imageById.get(id)?.originalName ?? null,
      sortOrder: index,
    })),
    ...files.map((id, index) => ({
      fileId: id,
      originalName: fileById.get(id)?.originalName ?? null,
      sortOrder: images.length + index,
    })),
  ];
}

export const attachmentSelect = {
  id: true,
  originalName: true,
  sortOrder: true,
  imageId: true,
  fileId: true,
  image: { select: { id: true, mimeType: true, originalName: true } },
  file: { select: { id: true, mimeType: true, originalName: true } },
} as const;
