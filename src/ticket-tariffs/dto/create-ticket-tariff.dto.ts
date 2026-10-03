import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class CreateTicketTariffDto {
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1500)
  year: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  individualPrice: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  individualQeshmondiPrice: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  vehiclePrice: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  vehicleQeshmondiPrice: number;
}
