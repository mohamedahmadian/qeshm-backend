import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { UserStatus } from '../../generated/prisma/client';
import { emptyToUndefined, toOptionalBoolean } from '../../common/dto-transform';

export const userSortFields = [
  'fullName',
  'username',
  'phone',
  'status',
  'nationalId',
  'city',
  'createdAt',
  'orgUnit',
  'position',
  'occupation',
  'isResident',
  'qeshmondiStartDate',
  'qeshmondiEndDate',
  'passportNumber',
  'qeshmondiGroup',
  'individualTicketQuota',
] as const;

export type UserSortField = (typeof userSortFields)[number];

export const CITY_ID_NONE = 'none';

export const qeshmondiValidityFilters = ['valid', 'expired'] as const;

export type QeshmondiValidityFilter = (typeof qeshmondiValidityFilters)[number];

function optionalQueryYear(value: unknown) {
  const raw =
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!/^\d{4}$/.test(raw)) return undefined;
  return Number(raw);
}

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
  @IsUUID()
  orgUnitId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  positionId?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  employeesOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  qeshmondiOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isResident?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @IsIn([...qeshmondiValidityFilters])
  qeshmondiValidity?: QeshmondiValidityFilter;

  /** سال تولد در تقویم زبان درخواست (جلالی برای fa/ar/ur، میلادی برای en/hi). */
  @IsOptional()
  @Transform(({ value }) => optionalQueryYear(value))
  @IsInt()
  @Min(1000)
  @Max(9999)
  birthYear?: number;

  /** سال انقضای کارت شهروندی، همان تقویم زبان درخواست. */
  @IsOptional()
  @Transform(({ value }) => optionalQueryYear(value))
  @IsInt()
  @Min(1000)
  @Max(9999)
  qeshmondiEndYear?: number;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...userSortFields])
  sortBy?: UserSortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
