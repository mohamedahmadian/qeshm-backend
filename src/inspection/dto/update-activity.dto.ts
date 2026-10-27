import { PartialType } from '@nestjs/mapped-types';
import { CreateInspectionActivityDto } from './create-activity.dto';

export class UpdateInspectionActivityDto extends PartialType(CreateInspectionActivityDto) {}
