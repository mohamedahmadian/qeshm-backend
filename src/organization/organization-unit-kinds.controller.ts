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
import { CreateOrganizationUnitKindDto } from './dto/create-organization-unit-kind.dto';
import { FindOrganizationUnitKindsQueryDto } from './dto/find-organization-unit-kinds-query.dto';
import { UpdateOrganizationUnitKindDto } from './dto/update-organization-unit-kind.dto';
import { OrganizationUnitKindsService } from './organization-unit-kinds.service';

@Controller('organization/unit-kinds')
export class OrganizationUnitKindsController {
  constructor(private readonly kinds: OrganizationUnitKindsService) {}

  @Get()
  findAll(@Query() query: FindOrganizationUnitKindsQueryDto) {
    return this.kinds.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateOrganizationUnitKindDto) {
    return this.kinds.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.kinds.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationUnitKindDto) {
    return this.kinds.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.kinds.remove(id);
  }
}
