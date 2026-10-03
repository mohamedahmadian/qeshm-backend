import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';

export const portTicketExportGroups = ['invalid', 'weekly'] as const;

export type PortTicketExportGroup = (typeof portTicketExportGroups)[number];

export class ExportPortTicketSalesQueryDto {
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...portTicketExportGroups])
  group!: PortTicketExportGroup;
}
