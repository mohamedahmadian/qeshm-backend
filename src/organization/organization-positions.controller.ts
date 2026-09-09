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
import { CreateOrganizationPositionDto } from './dto/create-organization-position.dto';
import { FindOrganizationPositionsQueryDto } from './dto/find-organization-positions-query.dto';
import { UpdateOrganizationPositionDto } from './dto/update-organization-position.dto';
import { OrganizationPositionsService } from './organization-positions.service';

@Controller('organization/positions')
export class OrganizationPositionsController {
  constructor(private readonly positions: OrganizationPositionsService) {}

  @Get()
  findAll(@Query() query: FindOrganizationPositionsQueryDto) {
    return this.positions.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateOrganizationPositionDto) {
    return this.positions.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.positions.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationPositionDto) {
    return this.positions.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.positions.remove(id);
  }
}
