import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WeeklyMenuFoodDto {
  @IsUUID('4')
  foodId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;
}

export class WeeklyMenuDayDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyMenuFoodDto)
  items: WeeklyMenuFoodDto[];
}

export class ReplaceWeeklyMenuDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeeklyMenuDayDto)
  days: WeeklyMenuDayDto[];
}
