import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { boardMinutesKinds } from './find-board-minutes-query.dto';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export class FindBoardReportsQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  })
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @Matches(isoDate)
  from?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @Matches(isoDate)
  to?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...boardMinutesKinds])
  kind?: (typeof boardMinutesKinds)[number];
}
