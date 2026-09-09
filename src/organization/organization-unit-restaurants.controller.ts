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
import { CreateOrganizationUnitRestaurantDto } from './dto/create-organization-unit-restaurant.dto';
import { FindOrganizationUnitRestaurantsQueryDto } from './dto/find-organization-unit-restaurants-query.dto';
import { UpdateOrganizationUnitRestaurantDto } from './dto/update-organization-unit-restaurant.dto';
import { OrganizationUnitRestaurantsService } from './organization-unit-restaurants.service';

@Controller('organization/units/:unitId/restaurants')
export class OrganizationUnitRestaurantsController {
  constructor(private readonly links: OrganizationUnitRestaurantsService) {}

  @Get()
  findAll(
    @Param('unitId') unitId: string,
    @Query() query: FindOrganizationUnitRestaurantsQueryDto,
  ) {
    return this.links.findAll(unitId, query);
  }

  @Post()
  create(
    @Param('unitId') unitId: string,
    @Body() dto: CreateOrganizationUnitRestaurantDto,
  ) {
    return this.links.create(unitId, dto);
  }

  @Get(':id')
  findOne(@Param('unitId') unitId: string, @Param('id') id: string) {
    return this.links.findOne(unitId, id);
  }

  @Patch(':id')
  update(
    @Param('unitId') unitId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationUnitRestaurantDto,
  ) {
    return this.links.update(unitId, id, dto);
  }

  @Delete(':id')
  remove(@Param('unitId') unitId: string, @Param('id') id: string) {
    return this.links.remove(unitId, id);
  }
}
