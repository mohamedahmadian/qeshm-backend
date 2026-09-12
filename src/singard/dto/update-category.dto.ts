import { PartialType } from '@nestjs/mapped-types';
import { CreateSingardCategoryDto } from './create-category.dto';

export class UpdateSingardCategoryDto extends PartialType(CreateSingardCategoryDto) {}
