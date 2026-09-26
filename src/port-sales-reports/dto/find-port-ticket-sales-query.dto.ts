import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { PortTicketQeshmondiStatus, PortTicketStatus } from '../../generated/prisma/client';

export const portTicketSaleSortFields = [
  'ticketNumber',
  'nationalId',
  'fullName',
  'ticketStatus',
  'qeshmondiStatus',
  'travelDate',
  'amount',
  'rowNumber',
] as const;

export const portTicketStatusFilters = [
  PortTicketStatus.IN_TRIP,
  PortTicketStatus.OPERATOR_CANCELLED,
  PortTicketStatus.EXPIRED,
  PortTicketStatus.OTHER,
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
  @IsIn([...portTicketStatusFilters])
  ticketStatus?: (typeof portTicketStatusFilters)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...portTicketQeshmondiFilters])
  qeshmondiStatus?: (typeof portTicketQeshmondiFilters)[number];
}
