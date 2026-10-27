import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { ImagesModule } from '../images/images.module';
import { InspectionCategoriesController } from './categories.controller';
import { InspectionCategoriesService } from './categories.service';
import { InspectionFeedbacksController } from './feedbacks.controller';
import { InspectionFeedbacksService } from './feedbacks.service';
import { InspectionKindsController } from './kinds.controller';
import { InspectionKindsService } from './kinds.service';
import { PublicInspectionController } from './public-inspection.controller';

@Module({
  imports: [ImagesModule, FilesModule],
  controllers: [
    PublicInspectionController,
    InspectionKindsController,
    InspectionCategoriesController,
    InspectionFeedbacksController,
  ],
  providers: [InspectionKindsService, InspectionCategoriesService, InspectionFeedbacksService],
})
export class InspectionModule {}
