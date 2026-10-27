import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { normalizeMobile } from '../../common/phone';
import {
  MAX_BOARD_RESOLUTION_SMS_LENGTH,
  MAX_BOARD_RESOLUTION_UNITS,
} from '../board.constants';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class BoardResolutionSmsPhoneDto {
  @IsUUID('4')
  unitId: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeMobile(value) : value))
  @Matches(/^09\d{9}$/, { message: 'شماره همراه معتبر نیست' })
  phone: string;
}

export class SendBoardResolutionSmsDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_BOARD_RESOLUTION_SMS_LENGTH)
  body: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_RESOLUTION_UNITS)
  @IsUUID('4', { each: true })
  unitIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_RESOLUTION_UNITS)
  @ValidateNested({ each: true })
  @Type(() => BoardResolutionSmsPhoneDto)
  phones?: BoardResolutionSmsPhoneDto[];
}
