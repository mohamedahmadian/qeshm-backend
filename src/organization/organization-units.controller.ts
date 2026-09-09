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
import { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import { FindOrganizationUnitsQueryDto } from './dto/find-organization-units-query.dto';
import { UpdateOrganizationUnitDto } from './dto/update-organization-unit.dto';
import { OrganizationUnitsService } from './organization-units.service';

@Controller('organization/units')
export class OrganizationUnitsController {
  constructor(private readonly units: OrganizationUnitsService) {}

  @Get()
  findAll(@Query() query: FindOrganizationUnitsQueryDto) {
    return this.units.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateOrganizationUnitDto) {
    return this.units.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.units.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationUnitDto) {
    return this.units.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.units.remove(id);
  }
}
