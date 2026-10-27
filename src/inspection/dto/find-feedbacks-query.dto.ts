import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { inspectionFeedbackStatuses } from '../inspection.constants';

export const inspectionFeedbackSortFields = [
  'trackingCode',
  'kind',
  'status',
  'category',
  'submitter',
  'phone',
  'createdAt',
] as const;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export class FindInspectionFeedbacksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...inspectionFeedbackSortFields])
  sortBy?: (typeof inspectionFeedbackSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  kindId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...inspectionFeedbackStatuses])
  status?: (typeof inspectionFeedbackStatuses)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @Matches(isoDate)
  from?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @Matches(isoDate)
  to?: string;
}
