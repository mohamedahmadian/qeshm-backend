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
import { CreateInspectionKindDto } from './dto/create-kind.dto';
import { FindInspectionKindsQueryDto } from './dto/find-kinds-query.dto';
import { UpdateInspectionKindDto } from './dto/update-kind.dto';
import { InspectionKindsService } from './kinds.service';

@Controller('inspection/kinds')
export class InspectionKindsController {
  constructor(private readonly kinds: InspectionKindsService) {}

  @Get()
  findAll(@Query() query: FindInspectionKindsQueryDto) {
    return this.kinds.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.kinds.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateInspectionKindDto) {
    return this.kinds.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInspectionKindDto) {
    return this.kinds.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.kinds.remove(id);
  }
}
