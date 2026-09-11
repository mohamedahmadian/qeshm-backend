import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { OrganizationUnitKind } from '../../generated/prisma/client';

export const organizationUnitSortFields = [
  'name',
  'kind',
  'parent',
  'phone',
  'nutritionRep',
  'employeeCount',
  'restaurantCount',
] as const;

export class FindOrganizationUnitsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(OrganizationUnitKind)
  kind?: OrganizationUnitKind;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID('4')
  parentId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...organizationUnitSortFields])
  sortBy?: (typeof organizationUnitSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
