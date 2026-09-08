import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { UserStatus } from '../../generated/prisma/client';
import { emptyToUndefined } from '../../common/dto-transform';

export const userSortFields = [
  'fullName',
  'username',
  'phone',
  'status',
  'nationalId',
  'city',
  'createdAt',
] as const;

export type UserSortField = (typeof userSortFields)[number];

export const CITY_ID_NONE = 'none';

export class FindUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  provinceId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value !== CITY_ID_NONE)
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...userSortFields])
  sortBy?: UserSortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
