import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { singardFeedbackKinds, singardFeedbackStatuses } from '../singard.constants';

export const singardFeedbackSortFields = [
  'trackingCode',
  'kind',
  'status',
  'category',
  'submitter',
  'phone',
  'createdAt',
] as const;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export class FindSingardFeedbacksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...singardFeedbackSortFields])
  sortBy?: (typeof singardFeedbackSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...singardFeedbackKinds])
  kind?: (typeof singardFeedbackKinds)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...singardFeedbackStatuses])
  status?: (typeof singardFeedbackStatuses)[number];

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
