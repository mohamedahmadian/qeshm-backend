import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateRestaurantMenuItemDto } from './dto/create-restaurant-menu-item.dto';
import { FindRestaurantMenuItemsQueryDto } from './dto/find-restaurant-menu-items-query.dto';
import { UpdateRestaurantMenuItemDto } from './dto/update-restaurant-menu-item.dto';
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

  @Post()
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateRestaurantMenuItemDto,
  ) {
    return this.menu.create(restaurantId, dto);
  }

  @Get(':id')
  findOne(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.menu.findOne(restaurantId, id);
  }

  @Patch(':id')
  update(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantMenuItemDto,
  ) {
    return this.menu.update(restaurantId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.menu.remove(restaurantId, id);
  }
}
