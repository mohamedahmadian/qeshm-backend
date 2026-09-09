import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

function toIdList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

export class CreateOrganizationUnitRestaurantDto {
  @Transform(({ value }) => toIdList(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  restaurantIds: string[];
}
