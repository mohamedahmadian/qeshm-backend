import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { mineSummaryPeriods } from '../mine-summary-range';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export class MineFoodSummaryQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...mineSummaryPeriods])
  period?: (typeof mineSummaryPeriods)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @Matches(isoDate)
  reservedFrom?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @Matches(isoDate)
  reservedTo?: string;
}
