import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { vehicleStatuses, vehicleTypes } from './create-vehicle.dto';

export const vehicleSortFields = [
  'assetCode',
  'plate',
  'type',
  'brand',
  'model',
  'year',
  'status',
] as const;

export class FindVehiclesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...vehicleSortFields])
  sortBy?: (typeof vehicleSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...vehicleTypes])
  type?: (typeof vehicleTypes)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...vehicleStatuses])
  status?: (typeof vehicleStatuses)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4')
  brandId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4')
  organizationUnitId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4')
  personId?: string;
}
