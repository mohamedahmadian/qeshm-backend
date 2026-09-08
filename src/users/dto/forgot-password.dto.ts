import { Transform } from 'class-transformer';
import { IsIn, IsString, MinLength } from 'class-validator';
import { toLatinDigits } from '../../common/national-id';

export const forgotPasswordChannels = ['sms', 'email'] as const;
export type ForgotPasswordChannel = (typeof forgotPasswordChannels)[number];

export class ForgotPasswordDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? toLatinDigits(value.trim()) : value,
  )
  @IsString()
  @MinLength(3)
  identifier: string;

  @IsIn([...forgotPasswordChannels])
  channel: ForgotPasswordChannel;
}
