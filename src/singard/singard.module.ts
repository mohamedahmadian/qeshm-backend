import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { ImagesModule } from '../images/images.module';
import { SingardCategoriesController } from './categories.controller';
import { SingardCategoriesService } from './categories.service';
import { SingardFeedbacksController } from './feedbacks.controller';
import { SingardFeedbacksService } from './feedbacks.service';
import { SingardKindsController } from './kinds.controller';
import { SingardKindsService } from './kinds.service';
import { PublicSingardController } from './public-singard.controller';

@Module({
  imports: [ImagesModule, FilesModule],
  controllers: [
    PublicSingardController,
    SingardKindsController,
    SingardCategoriesController,
    SingardFeedbacksController,
  ],
  providers: [SingardKindsService, SingardCategoriesService, SingardFeedbacksService],
})
export class SingardModule {}
