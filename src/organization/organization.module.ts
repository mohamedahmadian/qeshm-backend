import { Module } from '@nestjs/common';
import { OrganizationPhonesController } from './organization-phones.controller';
import { OrganizationPhonesService } from './organization-phones.service';
import { OrganizationPositionsController } from './organization-positions.controller';
import { OrganizationPositionsService } from './organization-positions.service';
import { OrganizationUnitRestaurantsController } from './organization-unit-restaurants.controller';
import { OrganizationUnitRestaurantsService } from './organization-unit-restaurants.service';
import { OrganizationUnitsController } from './organization-units.controller';
import { OrganizationUnitsService } from './organization-units.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

@Module({
  controllers: [
    OrganizationController,
    OrganizationPhonesController,
    OrganizationPositionsController,
    OrganizationUnitsController,
    OrganizationUnitRestaurantsController,
  ],
  providers: [
    OrganizationService,
    OrganizationPhonesService,
    OrganizationPositionsService,
    OrganizationUnitsService,
    OrganizationUnitRestaurantsService,
  ],
})
export class OrganizationModule {}
