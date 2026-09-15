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
import { CreateRestaurantUnitDto } from './dto/create-restaurant-unit.dto';
import { FindRestaurantUnitsQueryDto } from './dto/find-restaurant-units-query.dto';
import { UpdateRestaurantUnitDto } from './dto/update-restaurant-unit.dto';
import { RestaurantUnitsService } from './restaurant-units.service';

@Controller('restaurants/:restaurantId/units')
export class RestaurantUnitsController {
  constructor(private readonly links: RestaurantUnitsService) {}

  @Get()
  findAll(
    @Param('restaurantId') restaurantId: string,
    @Query() query: FindRestaurantUnitsQueryDto,
  ) {
    return this.links.findAll(restaurantId, query);
  }

  @Post()
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateRestaurantUnitDto,
  ) {
    return this.links.create(restaurantId, dto);
  }

  @Get(':id')
  findOne(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.links.findOne(restaurantId, id);
  }

  @Patch(':id')
  update(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantUnitDto,
  ) {
    return this.links.update(restaurantId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.links.remove(restaurantId, id);
  }
}
