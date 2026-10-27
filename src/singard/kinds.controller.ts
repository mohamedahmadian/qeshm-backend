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
import { CreateSingardKindDto } from './dto/create-kind.dto';
import { FindSingardKindsQueryDto } from './dto/find-kinds-query.dto';
import { UpdateSingardKindDto } from './dto/update-kind.dto';
import { SingardKindsService } from './kinds.service';

@Controller('singard/kinds')
export class SingardKindsController {
  constructor(private readonly kinds: SingardKindsService) {}

  @Get()
  findAll(@Query() query: FindSingardKindsQueryDto) {
    return this.kinds.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.kinds.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSingardKindDto) {
    return this.kinds.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSingardKindDto) {
    return this.kinds.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.kinds.remove(id);
  }
}
