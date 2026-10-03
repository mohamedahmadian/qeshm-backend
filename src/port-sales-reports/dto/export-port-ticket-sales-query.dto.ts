import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PortTicketQeshmondiStatus } from '../../generated/prisma/client';

export const portTicketExportGroups = ['all', 'invalid', 'weekly', 'personal'] as const;

export type PortTicketExportGroup = (typeof portTicketExportGroups)[number];

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
}
