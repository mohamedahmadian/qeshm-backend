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
import { CreateCityDto } from './dto/create-city.dto';
import { FindGeoQueryDto } from './dto/find-geo-query.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { GeoService } from './geo.service';

@Controller('cities')
export class CitiesController {
  constructor(private readonly geo: GeoService) {}

  @Get()
  findAll(@Query() query: FindGeoQueryDto) {
    return this.geo.findCities(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.geo.findCity(id);
  }

  @Post()
  create(@Body() dto: CreateCityDto) {
    return this.geo.createCity(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    return this.geo.updateCity(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.geo.removeCity(id);
  }
}
