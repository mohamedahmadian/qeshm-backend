import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Jimp, JimpMime } from 'jimp';
import { PrismaService } from '../prisma/prisma.service';

/** Reject oversized uploads before processing. */
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
/** Guard against huge pixel buffers (DoS / memory). */
const MAX_SOURCE_PIXELS = 40_000_000;
/** Longest edge after resize (~media-storage rule). */
const MAX_EDGE = 1600;
/** Preferred JPEG quality. */
const JPEG_QUALITY_START = 88;
/** Hard cap on stored BYTEA size after compression. */
const MAX_STORED_BYTES = 900 * 1024;

type ImageUpload = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

type EncodedImage = {
  data: Buffer;
  mimeType: (typeof JimpMime)['jpeg'] | (typeof JimpMime)['png'];
};

@Injectable()
export class ImagesService {
  constructor(private readonly prisma: PrismaService) {}

  async store(file: ImageUpload) {
    if (!file?.buffer) {
      throw new BadRequestException('فایل تصویر ارسال نشده است');
    }
    if (file.size > MAX_INPUT_BYTES) {
      throw new BadRequestException('حجم تصویر بیش از حد مجاز است');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('فقط فایل تصویر مجاز است');
    }

    let image;
    try {
      image = await Jimp.read(file.buffer);
    } catch {
      throw new BadRequestException('فایل تصویر نامعتبر است');
    }

    if (image.width * image.height > MAX_SOURCE_PIXELS) {
      throw new BadRequestException('ابعاد تصویر بیش از حد مجاز است');
    }

    if (image.width > MAX_EDGE || image.height > MAX_EDGE) {
      image.scaleToFit({ w: MAX_EDGE, h: MAX_EDGE });
    }

    const encoded = await encodeStoredImage(
      image,
      isPngSource(file) || image.hasAlpha(),
    );
    if (!encoded) {
      throw new BadRequestException(
        'پس از بهینه‌سازی، حجم تصویر هنوز بیش از حد مجاز است',
      );
    }

    return this.prisma.storedImage.create({
      data: {
        mimeType: encoded.mimeType,
        data: Buffer.from(encoded.data),
        byteSize: encoded.data.length,
        width: image.width,
        height: image.height,
        originalName: withStoredFileName(file.originalname, encoded.mimeType),
      },
      select: {
        id: true,
        mimeType: true,
        byteSize: true,
        width: true,
        height: true,
      },
    });
  }

  async find(id: string) {
    const image = await this.prisma.storedImage.findUnique({ where: { id } });
    if (!image) {
      throw new NotFoundException();
    }
    return image;
  }
}

function isPngSource(file: ImageUpload) {
  if (file.mimetype === JimpMime.png) {
    return true;
  }
  if (/\.png$/i.test(file.originalname ?? '')) {
    return true;
  }
  return (
    file.buffer.length >= 4 &&
    file.buffer[0] === 0x89 &&
    file.buffer[1] === 0x50 &&
    file.buffer[2] === 0x4e &&
    file.buffer[3] === 0x47
  );
}

function withStoredFileName(originalName: string | undefined, mimeType: string) {
  const ext = mimeType === JimpMime.png ? 'png' : 'jpg';
  const raw = (originalName ?? 'image').trim() || 'image';
  const base = raw.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.${ext}`;
}

async function encodeStoredImage(
  image: Awaited<ReturnType<typeof Jimp.read>>,
  preferPng: boolean,
): Promise<EncodedImage | null> {
  if (preferPng) {
    const png = await image.getBuffer(JimpMime.png);
    if (png.length <= MAX_STORED_BYTES) {
      return { data: png, mimeType: JimpMime.png };
    }
  }
  const jpeg = await encodeJpegUnderLimit(image);
  if (!jpeg) {
    return null;
  }
  return { data: jpeg, mimeType: JimpMime.jpeg };
}

async function encodeJpegUnderLimit(
  image: Awaited<ReturnType<typeof Jimp.read>>,
) {
  const source = image.hasAlpha()
    ? new Jimp({
        width: image.width,
        height: image.height,
        color: 0xffffffff,
      }).composite(image, 0, 0)
    : image;
  const qualities = [
    JPEG_QUALITY_START,
    82,
    76,
    70,
    64,
  ];
  for (const quality of qualities) {
    const data = await source.getBuffer(JimpMime.jpeg, { quality });
    if (data.length <= MAX_STORED_BYTES) {
      return data;
    }
  }
  return null;
}
