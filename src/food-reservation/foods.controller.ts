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
import { CreateFoodDto } from './dto/create-food.dto';
import { FindFoodsQueryDto } from './dto/find-foods-query.dto';
import { UpdateFoodDto } from './dto/update-food.dto';
import { FoodsService } from './foods.service';

@Controller('foods')
export class FoodsController {
  constructor(private readonly foods: FoodsService) {}

  @Get()
  findAll(@Query() query: FindFoodsQueryDto) {
    return this.foods.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.foods.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateFoodDto) {
    return this.foods.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFoodDto) {
    return this.foods.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.foods.remove(id);
  }
}
