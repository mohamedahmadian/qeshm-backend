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
import { CreateProvinceDto } from './dto/create-province.dto';
import { FindGeoQueryDto } from './dto/find-geo-query.dto';
import { UpdateProvinceDto } from './dto/update-province.dto';
import { GeoService } from './geo.service';

@Controller('provinces')
export class ProvincesController {
  constructor(private readonly geo: GeoService) {}

  @Get()
  findAll(@Query() query: FindGeoQueryDto) {
    return this.geo.findProvinces(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.geo.findProvince(id);
  }

  @Post()
  create(@Body() dto: CreateProvinceDto) {
    return this.geo.createProvince(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProvinceDto) {
    return this.geo.updateProvince(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.geo.removeProvince(id);
  }
}
