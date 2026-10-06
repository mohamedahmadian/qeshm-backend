import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class AllocatePortSalesSubsidyDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  amount!: number;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
