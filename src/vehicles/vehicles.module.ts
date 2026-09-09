import { Module } from '@nestjs/common';
import { VehicleAssignmentsController } from './vehicle-assignments.controller';
import { VehicleAssignmentsService } from './vehicle-assignments.service';
import { VehicleBrandsController } from './vehicle-brands.controller';
import { VehicleBrandsService } from './vehicle-brands.service';
import { VehicleReportsService } from './vehicle-reports.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  controllers: [
    VehicleBrandsController,
    VehiclesController,
    VehicleAssignmentsController,
  ],
  providers: [
    VehicleBrandsService,
    VehiclesService,
    VehicleAssignmentsService,
    VehicleReportsService,
  ],
})
export class VehiclesModule {}
