import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { emptyToNull, toBoolean } from '../../common/dto-transform';
import {
  MAX_BOARD_RESOLUTION_SIGNATORIES,
  MAX_BOARD_RESOLUTION_UNITS,
  boardResolutionDueKinds,
  boardResolutionProposerKinds,
  boardResolutionStatuses,
} from '../board.constants';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class BoardResolutionSignatoryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  sourceSignatoryId?: string | null;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @Transform(({ value }) => trimString(value))
  @IsUUID('4')
  signatureImageId: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @Matches(isoDate)
  signedAt?: string | null;
}

export class CreateBoardResolutionDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  title: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(8000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  requestId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_RESOLUTION_UNITS)
  @IsUUID('4', { each: true })
  unitIds?: string[];

  @IsOptional()
  @IsIn([...boardResolutionStatuses])
  status?: (typeof boardResolutionStatuses)[number];

  @IsOptional()
  @IsIn([...boardResolutionDueKinds])
  dueKind?: (typeof boardResolutionDueKinds)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @Matches(isoDate)
  dueDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : toBoolean(value)))
  @IsBoolean()
  hasTopicHistory?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(8000)
  legalBasis?: string | null;

  @IsOptional()
  @IsIn([...boardResolutionProposerKinds])
  proposerKind?: (typeof boardResolutionProposerKinds)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(240)
  proposerText?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  proposerUnitId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(8000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOARD_RESOLUTION_SIGNATORIES)
  @ValidateNested({ each: true })
  @Type(() => BoardResolutionSignatoryDto)
  signatories?: BoardResolutionSignatoryDto[];
}
