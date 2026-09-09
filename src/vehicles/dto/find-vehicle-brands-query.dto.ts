import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const vehicleBrandSortFields = ['name', 'vehicleCount'] as const;

export class FindVehicleBrandsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...vehicleBrandSortFields])
  sortBy?: (typeof vehicleBrandSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
