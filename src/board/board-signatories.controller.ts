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
import { BoardSignatoriesService } from './board-signatories.service';
import { CreateBoardSignatoryDto } from './dto/create-board-signatory.dto';
import { FindBoardSignatoriesQueryDto } from './dto/find-board-signatories-query.dto';
import { UpdateBoardSignatoryDto } from './dto/update-board-signatory.dto';

@Controller('board/signatories')
export class BoardSignatoriesController {
  constructor(private readonly signatories: BoardSignatoriesService) {}

  @Get()
  findAll(@Query() query: FindBoardSignatoriesQueryDto) {
    return this.signatories.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateBoardSignatoryDto) {
    return this.signatories.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.signatories.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBoardSignatoryDto) {
    return this.signatories.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.signatories.remove(id);
  }
}
