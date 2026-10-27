import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_BOARD_MINUTES_MEMBERS, MAX_BOARD_MINUTES_SMS_LENGTH } from '../board.constants';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class SendBoardMinutesSmsDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_BOARD_MINUTES_SMS_LENGTH)
  body: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_MINUTES_MEMBERS)
  @IsUUID('4', { each: true })
  memberIds?: string[];
}
