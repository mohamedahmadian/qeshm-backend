import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationService } from './organization.service';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get()
  findCurrent() {
    return this.organization.findCurrent();
  }

  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.organization.create(dto);
  }

  @Patch()
  update(@Body() dto: UpdateOrganizationDto) {
    return this.organization.update(dto);
  }
}
