import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const vehicleAssignmentStatuses = ['LENT', 'RETURNED'] as const;

export const vehicleAssignmentSortFields = [
  'startDate',
  'endDate',
  'returnedAt',
  'type',
  'status',
  'organizationUnit',
  'person',
] as const;

export class FindVehicleAssignmentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...vehicleAssignmentSortFields])
  sortBy?: (typeof vehicleAssignmentSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...vehicleAssignmentStatuses])
  status?: (typeof vehicleAssignmentStatuses)[number];
}
