import { PartialType } from '@nestjs/mapped-types';
import { CreateProjectChecklistItemDto } from './create-project-checklist-item.dto';

export class UpdateProjectChecklistItemDto extends PartialType(
  CreateProjectChecklistItemDto,
) {}
