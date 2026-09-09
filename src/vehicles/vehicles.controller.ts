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
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { FindVehiclesQueryDto } from './dto/find-vehicles-query.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleReportsService } from './vehicle-reports.service';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly reports: VehicleReportsService,
  ) {}

  @Get()
  findAll(@Query() query: FindVehiclesQueryDto) {
    return this.vehicles.findAll(query);
  }

  @Get('reports')
  reportsOverview(@Query() query: FindVehiclesQueryDto) {
    return this.reports.overview(query);
  }

  @Post()
  create(@Body() dto: CreateVehicleDto) {
    return this.vehicles.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehicles.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehicles.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vehicles.remove(id);
  }
}
