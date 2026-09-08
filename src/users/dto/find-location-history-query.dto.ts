import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

import { LocationSource } from '../../generated/prisma/client';
import { locationSources } from './update-user-location.dto';

export const locationHistorySortFields = [
  'seq',
  'createdAt',
  'province',
  'city',
  'notes',
  'source',
] as const;

export type LocationHistorySortField =
  (typeof locationHistorySortFields)[number];

function emptyToUndefined(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export class FindLocationHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...locationHistorySortFields])
  sortBy?: LocationHistorySortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...locationSources])
  source?: LocationSource;
}
