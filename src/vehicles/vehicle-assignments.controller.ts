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
import { CreateVehicleAssignmentDto } from './dto/create-vehicle-assignment.dto';
import { FindVehicleAssignmentsQueryDto } from './dto/find-vehicle-assignments-query.dto';
import { ReturnVehicleAssignmentDto } from './dto/return-vehicle-assignment.dto';
import { UpdateVehicleAssignmentDto } from './dto/update-vehicle-assignment.dto';
import { VehicleAssignmentsService } from './vehicle-assignments.service';

@Controller('vehicles/:vehicleId/assignments')
export class VehicleAssignmentsController {
  constructor(private readonly assignments: VehicleAssignmentsService) {}

  @Get()
  findAll(
    @Param('vehicleId') vehicleId: string,
    @Query() query: FindVehicleAssignmentsQueryDto,
  ) {
    return this.assignments.findAll(vehicleId, query);
  }

  @Post()
  create(
    @Param('vehicleId') vehicleId: string,
    @Body() dto: CreateVehicleAssignmentDto,
  ) {
    return this.assignments.create(vehicleId, dto);
  }

  @Get(':id')
  findOne(@Param('vehicleId') vehicleId: string, @Param('id') id: string) {
    return this.assignments.findOne(vehicleId, id);
  }

  @Patch(':id/return')
  returnItem(
    @Param('vehicleId') vehicleId: string,
    @Param('id') id: string,
    @Body() dto: ReturnVehicleAssignmentDto,
  ) {
    return this.assignments.returnItem(vehicleId, id, dto);
  }

  @Patch(':id')
  update(
    @Param('vehicleId') vehicleId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleAssignmentDto,
  ) {
    return this.assignments.update(vehicleId, id, dto);
  }

  @Delete(':id')
  remove(@Param('vehicleId') vehicleId: string, @Param('id') id: string) {
    return this.assignments.remove(vehicleId, id);
  }
}
