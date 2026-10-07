import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { toLatinDigits } from '../../common/national-id';

export class CooperativeLoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? toLatinDigits(value).trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  username: string;

  @Transform(({ value }) => (typeof value === 'string' ? toLatinDigits(value) : value))
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
