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
import { CreateVehicleBrandDto } from './dto/create-vehicle-brand.dto';
import { FindVehicleBrandsQueryDto } from './dto/find-vehicle-brands-query.dto';
import { UpdateVehicleBrandDto } from './dto/update-vehicle-brand.dto';
import { VehicleBrandsService } from './vehicle-brands.service';

@Controller('vehicle-brands')
export class VehicleBrandsController {
  constructor(private readonly brands: VehicleBrandsService) {}

  @Get()
  findAll(@Query() query: FindVehicleBrandsQueryDto) {
    return this.brands.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateVehicleBrandDto) {
    return this.brands.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.brands.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleBrandDto) {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.brands.remove(id);
  }
}
