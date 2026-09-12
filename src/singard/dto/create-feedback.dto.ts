import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull, toBoolean } from '../../common/dto-transform';
import {
  SINGARD_MAX_AUDIO,
  SINGARD_MAX_IMAGES,
  SINGARD_MAX_VIDEO,
  singardFeedbackKinds,
} from '../singard.constants';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateSingardFeedbackDto {
  @IsIn([...singardFeedbackKinds])
  kind: (typeof singardFeedbackKinds)[number];

  @IsUUID('4')
  categoryId: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value, false))
  @IsBoolean()
  introduce?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(8000)
  body?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SINGARD_MAX_IMAGES)
  @IsUUID('4', { each: true })
  imageIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SINGARD_MAX_AUDIO)
  @IsUUID('4', { each: true })
  audioIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SINGARD_MAX_VIDEO)
  @IsUUID('4', { each: true })
  videoIds?: string[];
}
