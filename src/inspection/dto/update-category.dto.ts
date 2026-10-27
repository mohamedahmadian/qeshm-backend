import { PartialType } from '@nestjs/mapped-types';
import { CreateInspectionCategoryDto } from './create-category.dto';

export class UpdateInspectionCategoryDto extends PartialType(CreateInspectionCategoryDto) {}
