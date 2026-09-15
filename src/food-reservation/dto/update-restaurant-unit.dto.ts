import { IsUUID } from 'class-validator';

export class UpdateRestaurantUnitDto {
  @IsUUID('4')
  unitId: string;
}
