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
import { InspectionCategoriesService } from './categories.service';
import { CreateInspectionCategoryDto } from './dto/create-category.dto';
import { FindInspectionCategoriesQueryDto } from './dto/find-categories-query.dto';
import { UpdateInspectionCategoryDto } from './dto/update-category.dto';

@Controller('inspection/categories')
export class InspectionCategoriesController {
  constructor(private readonly categories: InspectionCategoriesService) {}

  @Get('tree')
  tree() {
    return this.categories.tree();
  }

  @Get()
  findAll(@Query() query: FindInspectionCategoriesQueryDto) {
    return this.categories.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categories.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateInspectionCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInspectionCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
