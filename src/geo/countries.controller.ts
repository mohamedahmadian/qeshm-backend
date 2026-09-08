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
import { CreateCountryDto } from './dto/create-country.dto';
import { FindGeoQueryDto } from './dto/find-geo-query.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { GeoService } from './geo.service';

@Controller('countries')
export class CountriesController {
  constructor(private readonly geo: GeoService) {}

  @Get()
  findAll(@Query() query: FindGeoQueryDto) {
    return this.geo.findCountries(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.geo.findCountry(id);
  }

  @Post()
  create(@Body() dto: CreateCountryDto) {
    return this.geo.createCountry(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return this.geo.updateCountry(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.geo.removeCountry(id);
  }
}
