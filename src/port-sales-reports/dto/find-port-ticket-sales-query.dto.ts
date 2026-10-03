import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
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
}
