import { PartialType } from '@nestjs/mapped-types';
import { CreateVehicleAssignmentDto } from './create-vehicle-assignment.dto';

export class UpdateVehicleAssignmentDto extends PartialType(
  CreateVehicleAssignmentDto,
) {}
