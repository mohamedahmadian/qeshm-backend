import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { FindRestaurantMenuItemsQueryDto } from './dto/find-restaurant-menu-items-query.dto';
import { ReplaceWeeklyMenuDto } from './dto/replace-weekly-menu.dto';
import { RestaurantMenuService } from './restaurant-menu.service';

@Controller('restaurants/:restaurantId/menu-items')
export class RestaurantMenuController {
  constructor(private readonly menu: RestaurantMenuService) {}

  @Get()
  findAll(
    @Param('restaurantId') restaurantId: string,
    @Query() query: FindRestaurantMenuItemsQueryDto,
  ) {
    return this.menu.findAll(restaurantId, query);
  }

  @Put()
  replace(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ReplaceWeeklyMenuDto,
  ) {
    return this.menu.replaceWeekly(restaurantId, dto);
  }
}
