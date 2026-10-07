import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { IsIranianNationalId, toLatinDigits } from '../../common/national-id';

export class CooperativeInquiryQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? toLatinDigits(value).trim() : value))
  @IsString()
  @IsIranianNationalId()
  nationalId: string;
}
