import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';

export const vehicleAssignmentTypes = ['UNIT', 'PERSON'] as const;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateVehicleAssignmentDto {
  @IsIn([...vehicleAssignmentTypes])
  type: (typeof vehicleAssignmentTypes)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  organizationUnitId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  personId?: string | null;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ شروع معتبر نیست' })
  startDate: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(isoDate, { message: 'تاریخ پایان معتبر نیست' })
  endDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
