import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { toOptionalBoolean } from '../../common/dto-transform';
import { toLatinDigits } from '../../common/national-id';

export class ChangeUserPasswordDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? toLatinDigits(value) : value,
  )
  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  sendSms?: boolean;
}
