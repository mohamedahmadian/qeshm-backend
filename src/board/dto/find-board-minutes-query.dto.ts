import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { boardMinutesSortFields } from '../board.constants';

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
}
