import { Transform, Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
import {
  MAX_BOARD_ATTACHMENTS,
  MAX_BOARD_MINUTES_MEMBERS,
  MAX_BOARD_MINUTES_REQUESTS,
  boardMinutesAttendances,
  boardMinutesMemberKinds,
  boardMinutesStatuses,
} from '../board.constants';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class BoardMinutesMemberDto {
  @IsOptional()
  @IsIn([...boardMinutesMemberKinds])
  kind?: (typeof boardMinutesMemberKinds)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  userId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  signatoryId?: string | null;

  @ValidateIf((row: BoardMinutesMemberDto) => !row.userId && !row.signatoryId)
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ValidateIf((row: BoardMinutesMemberDto) => !row.userId && !row.signatoryId)
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @IsIn([...boardMinutesAttendances])
  attendance?: (typeof boardMinutesAttendances)[number];
}

export class CreateBoardMinutesDto {
  @Transform(({ value }) => trimString(value))
  @Matches(isoDate)
  heldAt: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  subject: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(20000)
  body?: string | null;

  @IsOptional()
  @IsIn([...boardMinutesStatuses])
  status?: (typeof boardMinutesStatuses)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_MINUTES_REQUESTS)
  @IsUUID('4', { each: true })
  requestIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_MINUTES_MEMBERS)
  @ValidateNested({ each: true })
  @Type(() => BoardMinutesMemberDto)
  members?: BoardMinutesMemberDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_ATTACHMENTS)
  @IsUUID('4', { each: true })
  imageIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_ATTACHMENTS)
  @IsUUID('4', { each: true })
  audioIds?: string[];
}
