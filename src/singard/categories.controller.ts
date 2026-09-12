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
import { SingardCategoriesService } from './categories.service';
import { CreateSingardCategoryDto } from './dto/create-category.dto';
import { FindSingardCategoriesQueryDto } from './dto/find-categories-query.dto';
import { UpdateSingardCategoryDto } from './dto/update-category.dto';

@Controller('singard/categories')
export class SingardCategoriesController {
  constructor(private readonly categories: SingardCategoriesService) {}

  @Get('tree')
  tree() {
    return this.categories.tree();
  }

  @Get()
  findAll(@Query() query: FindSingardCategoriesQueryDto) {
    return this.categories.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categories.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSingardCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSingardCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
