import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const COOPERATIVE_SYNC_PAGE_MAX = 500;

function emptyToUndefined(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export class CooperativeFullQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COOPERATIVE_SYNC_PAGE_MAX)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  afterId?: string;
}

export class CooperativeChangesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  from: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  to: number;
}
