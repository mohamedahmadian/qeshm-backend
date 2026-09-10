import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { ProjectProgressTranscriptionStatus } from '../../generated/prisma/client';

export const projectProgressSortFields = [
  'occurredAt',
  'body',
  'progressPercent',
  'transcriptionStatus',
  'createdAt',
] as const;

export class FindProjectProgressQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(ProjectProgressTranscriptionStatus)
  transcriptionStatus?: ProjectProgressTranscriptionStatus;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...projectProgressSortFields])
  sortBy?: (typeof projectProgressSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
