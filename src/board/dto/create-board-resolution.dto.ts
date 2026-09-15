import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
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

  @IsUUID('4')
  unitId: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @Matches(isoDate)
  dueDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(8000)
  notes?: string | null;
}
