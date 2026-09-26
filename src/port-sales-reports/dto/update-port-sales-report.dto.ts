import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdatePortSalesReportDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(isoDate, { message: 'تاریخ گزارش فروش معتبر نیست' })
  reportDate?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(120)
  origin?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(120)
  destination?: string;
}
