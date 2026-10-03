import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const portTicketQuotaScopes = ['weekly', 'personal'] as const;

export const portTicketQuotaSortFields = [
  'week',
  'nationalId',
  'total',
  'allowed',
  'unauthorized',
  'amount',
  'status',
] as const;

export class FindPortTicketQuotaQueryDto extends PaginationQueryDto {
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...portTicketQuotaScopes])
  scope!: (typeof portTicketQuotaScopes)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...portTicketQuotaSortFields])
  sortBy?: (typeof portTicketQuotaSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
