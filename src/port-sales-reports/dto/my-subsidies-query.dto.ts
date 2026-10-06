import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';

function optionalQueryInt(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class MySubsidiesQueryDto {
  @IsOptional()
  @Transform(({ value }) => optionalQueryInt(value))
  @IsInt()
  @Min(1200)
  @Max(1600)
  year?: number;

  @IsOptional()
  @Transform(({ value }) => optionalQueryInt(value))
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  /** فقط مدیریت و مدیر ماژول درگاه؛ خالی یعنی همه کاربران. */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  userId?: string;
}
