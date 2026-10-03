import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const ticketTariffSortFields = [
  'year',
  'individualPrice',
  'individualQeshmondiPrice',
  'individualSubsidy',
  'vehiclePrice',
  'vehicleQeshmondiPrice',
  'vehicleSubsidy',
] as const;

export class FindTicketTariffsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...ticketTariffSortFields])
  sortBy?: (typeof ticketTariffSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
