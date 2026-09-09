import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export class ReturnVehicleAssignmentDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ عودت معتبر نیست' })
  returnedAt: string;
}
