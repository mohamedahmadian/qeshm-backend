import { IsUUID } from 'class-validator';

export class UpdateOrganizationUnitRestaurantDto {
  @IsUUID('4')
  restaurantId: string;
}
