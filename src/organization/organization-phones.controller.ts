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
import { CreateOrganizationPhoneDto } from './dto/create-organization-phone.dto';
import { FindOrganizationPhonesQueryDto } from './dto/find-organization-phones-query.dto';
import { UpdateOrganizationPhoneDto } from './dto/update-organization-phone.dto';
import { OrganizationPhonesService } from './organization-phones.service';

@Controller('organization/phones')
export class OrganizationPhonesController {
  constructor(private readonly phones: OrganizationPhonesService) {}

  @Get()
  findAll(@Query() query: FindOrganizationPhonesQueryDto) {
    return this.phones.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateOrganizationPhoneDto) {
    return this.phones.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.phones.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationPhoneDto) {
    return this.phones.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.phones.remove(id);
  }
}
