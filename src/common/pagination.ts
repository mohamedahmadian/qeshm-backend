import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { toLatinDigits } from './national-id';

export const DEFAULT_PAGE_SIZE = 10;

export class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  })
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function wantsPagination(query: PaginationQueryDto) {
  return query.page != null || query.pageSize != null;
}

export function paginationArgs(query: PaginationQueryDto) {
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize =
    query.pageSize && query.pageSize > 0
      ? Math.min(query.pageSize, 100)
      : DEFAULT_PAGE_SIZE;
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function paginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return { items, total, page, pageSize };
}

export function containsInsensitive(q: string) {
  return { contains: q, mode: 'insensitive' as const };
}

export function startsWithInsensitive(q: string) {
  return { startsWith: q, mode: 'insensitive' as const };
}

/** Digits only (Persian/Arabic-Indic → Latin), for nationalId / phone fast path. */
export function normalizeSearchDigits(q: string) {
  return toLatinDigits(q).replace(/\D/g, '');
}
