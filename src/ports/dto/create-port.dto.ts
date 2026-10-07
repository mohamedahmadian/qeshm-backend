import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { toOptionalNumber } from '../../common/dto-transform';
import { toLatinDigits } from '../../common/national-id';
import { normalizeMobile } from '../../common/phone';

export const portKinds = ['INDIVIDUAL', 'VEHICLE'] as const;
export type PortKindValue = (typeof portKinds)[number];

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function emptyToNull(value: unknown) {
  const trimmed = trimString(value);
  if (typeof trimmed !== 'string' || !trimmed) return null;
  return trimmed;
}

function phoneDigits(value: unknown) {
  if (typeof value !== 'string') return value;
  const digits = toLatinDigits(value).replace(/[^\d+]/g, '');
  return digits || value;
}

function emptyToUndefined(value: unknown) {
  const trimmed = trimString(value);
  if (typeof trimmed !== 'string' || !trimmed) return undefined;
  return trimmed;
}

const securityTokenPattern = /^[A-Za-z0-9_-]{16,128}$/;

export class CreatePortOperatorDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeMobile(value) : value))
  @Matches(/^09\d{9}$/, { message: 'تلفن همراه معتبر نیست' })
  phone: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class CreatePortDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsUUID()
  cityId: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  cooperativeName: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsIn([...portKinds])
  kind: PortKindValue;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  managerName: string;

  @Transform(({ value }) => phoneDigits(value))
  @IsString()
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @Matches(securityTokenPattern, {
    message: 'توکن امنیتی باید ۱۶ تا ۱۲۸ نویسهٔ انگلیسی باشد',
  })
  securityToken?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID()
  operatorUserId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePortOperatorDto)
  newOperator?: CreatePortOperatorDto;
}
