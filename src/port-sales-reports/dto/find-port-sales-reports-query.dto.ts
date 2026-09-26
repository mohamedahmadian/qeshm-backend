import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const portSalesReportSortFields = [
  'reportDate',
  'createdAt',
  'origin',
  'destination',
  'recordCount',
  'uniqueNationalIdCount',
  'originalFileName',
] as const;

export class FindPortSalesReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...portSalesReportSortFields])
  sortBy?: (typeof portSalesReportSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
