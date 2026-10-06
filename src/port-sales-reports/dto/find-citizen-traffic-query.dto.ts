import { Transform } from 'class-transformer';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { normalizeNationalId } from '../../common/national-id';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const citizenTrafficScopes = ['all', 'weekly', 'personal'] as const;

export const citizenTrafficSortFields = [
  'ticketNumber',
  'nationalId',
  'passportNumber',
  'fullName',
  'citizenship',
  'qeshmondiStatus',
  'travelDate',
  'origin',
  'destination',
  'amount',
  'rowNumber',
  'week',
  'report',
  'total',
  'allowed',
  'unauthorized',
  'status',
] as const;

export class FindCitizenTrafficQueryDto extends PaginationQueryDto {
  @Transform(({ value }) => normalizeNationalId(typeof value === 'string' ? value : ''))
  @Matches(/^\d{10}$/)
  nationalId!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...citizenTrafficScopes])
  scope?: (typeof citizenTrafficScopes)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...citizenTrafficSortFields])
  sortBy?: (typeof citizenTrafficSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
