import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull, emptyToUndefined } from '../../common/dto-transform';
import { MAX_BOARD_ATTACHMENTS } from '../board.constants';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateBoardRequestDto {
  @Transform(({ value }) => trimString(value))
  @Matches(isoDate)
  requestedAt: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  unitId?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  orgPositionText: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  subject: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(8000)
  justification?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(8000)
  topicHistory?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(8000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_ATTACHMENTS)
  @IsUUID('4', { each: true })
  imageIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_ATTACHMENTS)
  @IsUUID('4', { each: true })
  fileIds?: string[];
}
