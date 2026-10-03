import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PortTicketQeshmondiStatus } from '../../generated/prisma/client';

export const portTicketExportGroups = ['all', 'invalid', 'weekly', 'personal'] as const;

export type PortTicketExportGroup = (typeof portTicketExportGroups)[number];

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const qeshmondiFilters = [
  PortTicketQeshmondiStatus.UNKNOWN,
  PortTicketQeshmondiStatus.VALID,
  PortTicketQeshmondiStatus.INVALID,
] as const;

export class ExportPortTicketSalesQueryDto {
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...portTicketExportGroups])
  group!: PortTicketExportGroup;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...qeshmondiFilters])
  qeshmondiStatus?: (typeof qeshmondiFilters)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  subsidy?: number;

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
}
