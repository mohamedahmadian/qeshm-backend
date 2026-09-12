import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FilesService } from '../files/files.service';
import { ImagesService } from '../images/images.service';
import { SingardCategoriesService } from './categories.service';
import { CreateSingardFeedbackDto } from './dto/create-feedback.dto';
import { SingardFeedbacksService } from './feedbacks.service';
import { SINGARD_MAX_VIDEO_BYTES } from './singard.constants';

type RequestUser = { id: string };

type UploadFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

@Controller('public/singard')
export class PublicSingardController {
  constructor(
    private readonly categories: SingardCategoriesService,
    private readonly feedbacks: SingardFeedbacksService,
    private readonly images: ImagesService,
    private readonly files: FilesService,
  ) {}

  @Get('categories')
  tree() {
    return this.categories.tree(true);
  }

  @Post('images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadImage(@UploadedFile() file: UploadFile) {
    return this.images.store(file);
  }

  @Post('files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: SINGARD_MAX_VIDEO_BYTES },
    }),
  )
  uploadFile(
    @UploadedFile() file: UploadFile,
    @Body('durationMs') durationMs?: string,
  ) {
    const parsed = durationMs != null && durationMs !== '' ? Number(durationMs) : null;
    return this.files.store(
      file,
      Number.isFinite(parsed) && parsed != null && parsed >= 0 ? Math.round(parsed) : null,
    );
  }

  @Post('feedbacks')
  create(
    @Body() dto: CreateSingardFeedbackDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.feedbacks.create(dto, user?.id);
  }
}
