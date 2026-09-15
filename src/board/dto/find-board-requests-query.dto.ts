import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { boardRequestSortFields, boardRequestStatuses } from '../board.constants';

export class FindBoardRequestsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...boardRequestSortFields])
  sortBy?: (typeof boardRequestSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...boardRequestStatuses])
  status?: (typeof boardRequestStatuses)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  unitId?: string;
}
