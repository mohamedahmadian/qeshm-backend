import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const MAX_USER_SMS_LENGTH = 700;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class SendUserSmsDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_USER_SMS_LENGTH)
  body: string;
}
