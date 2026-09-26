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
import { ContractorTypesService } from './contractor-types.service';
import { CreateContractorTypeDto } from './dto/create-contractor-type.dto';
import { FindContractorTypesQueryDto } from './dto/find-contractor-types-query.dto';
import { UpdateContractorTypeDto } from './dto/update-contractor-type.dto';

@Controller('contractor-types')
export class ContractorTypesController {
  constructor(private readonly types: ContractorTypesService) {}

  @Get()
  findAll(@Query() query: FindContractorTypesQueryDto) {
    return this.types.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateContractorTypeDto) {
    return this.types.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.types.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContractorTypeDto) {
    return this.types.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.types.remove(id);
  }
}
