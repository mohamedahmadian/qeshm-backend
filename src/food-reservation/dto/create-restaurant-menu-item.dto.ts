import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { toOptionalBoolean, toOptionalNumber } from '../../common/dto-transform';

export class CreateRestaurantMenuItemDto {
  @IsUUID('4')
  foodId: string;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}
