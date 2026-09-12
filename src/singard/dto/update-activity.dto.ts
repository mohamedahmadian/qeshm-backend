import { PartialType } from '@nestjs/mapped-types';
import { CreateSingardActivityDto } from './create-activity.dto';

export class UpdateSingardActivityDto extends PartialType(CreateSingardActivityDto) {}
