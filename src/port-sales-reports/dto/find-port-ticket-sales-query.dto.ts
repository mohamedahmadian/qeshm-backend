import { Transform } from 'class-transformer';
import { IsIn, IsOptional, Matches, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { PortTicketQeshmondiStatus } from '../../generated/prisma/client';

export const portTicketSaleSortFields = [
  'ticketNumber',
  'nationalId',
  'passportNumber',
  'fullName',
  'citizenship',
  'qeshmondiStatus',
  'travelDate',
  'amount',
  'rowNumber',
] as const;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const portTicketQeshmondiFilters = [
  PortTicketQeshmondiStatus.UNKNOWN,
  PortTicketQeshmondiStatus.VALID,
  PortTicketQeshmondiStatus.INVALID,
] as const;

export class FindPortTicketSalesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...portTicketSaleSortFields])
  sortBy?: (typeof portTicketSaleSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...portTicketQeshmondiFilters])
  qeshmondiStatus?: (typeof portTicketQeshmondiFilters)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn(['excess'])
  weeklyQuota?: 'excess';

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
