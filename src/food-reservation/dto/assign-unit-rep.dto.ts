import { Transform } from 'class-transformer';
import { IsString, IsUUID, Matches, MinLength } from 'class-validator';
import { IsIranianNationalId, normalizeNationalId } from '../../common/national-id';
import { normalizeMobile } from '../../common/phone';

export class CreateUnitRepDto {
  @IsUUID('4')
  unitId: string;

  @IsUUID('4')
  nutritionRepId: string;
}

export class UpdateUnitRepDto {
  @IsUUID('4')
  nutritionRepId: string;
}

export class CreateUnitRepPersonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  lastName: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeNationalId(value) : value))
  @IsIranianNationalId()
  nationalId: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeMobile(value) : value))
  @Matches(/^09\d{9}$/, { message: 'تلفن همراه معتبر نیست' })
  phone: string;
}
