import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const advancedFoodOrderSortFields = [
  'createdAt',
  'orgUnit',
  'restaurant',
  'startsOn',
  'endsOn',
  'food',
  'employeeQuantity',
  'managementQuantity',
] as const;

export class FindAdvancedFoodOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...advancedFoodOrderSortFields])
  sortBy?: (typeof advancedFoodOrderSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}

export class AdvancedFoodWeekMenuQueryDto {
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4')
  restaurantId: string;
}
