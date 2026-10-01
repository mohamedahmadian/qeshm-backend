import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { boardMinutesSortFields } from '../board.constants';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const boardMinutesKinds = ['regular', 'linked'] as const;

export class FindBoardMinutesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...boardMinutesSortFields])
  sortBy?: (typeof boardMinutesSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  requestId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...boardMinutesKinds])
  kind?: (typeof boardMinutesKinds)[number];

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
