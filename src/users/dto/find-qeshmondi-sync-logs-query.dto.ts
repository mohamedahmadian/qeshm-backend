import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { QeshmondiSyncSource, QeshmondiSyncStatus } from '../../generated/prisma/client';

export const qeshmondiSyncLogSortFields = [
  'startedAt',
  'finishedAt',
  'source',
  'status',
  'createdCount',
  'updatedCount',
  'failedCount',
  'actor',
] as const;

export class FindQeshmondiSyncLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn(Object.values(QeshmondiSyncSource))
  source?: QeshmondiSyncSource;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn(Object.values(QeshmondiSyncStatus))
  status?: QeshmondiSyncStatus;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...qeshmondiSyncLogSortFields])
  sortBy?: (typeof qeshmondiSyncLogSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
