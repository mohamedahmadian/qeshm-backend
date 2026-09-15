import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateRestaurantMenuItemDto } from './create-restaurant-menu-item.dto';

export class UpdateRestaurantMenuItemDto extends PartialType(
  OmitType(CreateRestaurantMenuItemDto, ['offeredUntil'] as const),
) {}
