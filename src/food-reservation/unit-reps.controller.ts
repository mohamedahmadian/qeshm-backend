import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateUnitRepDto,
  CreateUnitRepPersonDto,
  UpdateUnitRepDto,
} from './dto/assign-unit-rep.dto';
import { FindUnitRepsQueryDto } from './dto/find-unit-reps-query.dto';
import { UnitRepsService } from './unit-reps.service';

@Controller('food-reservation/unit-reps')
export class UnitRepsController {
  constructor(private readonly unitReps: UnitRepsService) {}

  @Get()
  findAll(@Query() query: FindUnitRepsQueryDto) {
    return this.unitReps.findAll(query);
  }

  @Get(':unitId')
  findOne(@Param('unitId') unitId: string) {
    return this.unitReps.findOne(unitId);
  }

  @Post()
  create(@Body() dto: CreateUnitRepDto) {
    return this.unitReps.assign(dto.unitId, dto.nutritionRepId);
  }

  @Post(':unitId/person')
  createPerson(@Param('unitId') unitId: string, @Body() dto: CreateUnitRepPersonDto) {
    return this.unitReps.createPerson(unitId, dto);
  }

  @Patch(':unitId')
  update(@Param('unitId') unitId: string, @Body() dto: UpdateUnitRepDto) {
    return this.unitReps.assign(unitId, dto.nutritionRepId);
  }

  @Delete(':unitId')
  remove(@Param('unitId') unitId: string) {
    return this.unitReps.clear(unitId);
  }
}
