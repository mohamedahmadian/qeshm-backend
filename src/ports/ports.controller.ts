import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreatePortDto } from './dto/create-port.dto';
import { FindPortsQueryDto } from './dto/find-ports-query.dto';
import { UpdatePortDto } from './dto/update-port.dto';
import { PortActor, PortsService } from './ports.service';

@Controller('ports')
export class PortsController {
  constructor(private readonly ports: PortsService) {}

  @Get()
  findAll(@CurrentUser() user: PortActor | undefined, @Query() query: FindPortsQueryDto) {
    return this.ports.findAll(user, query);
  }

  @Post()
  create(@CurrentUser() user: PortActor | undefined, @Body() dto: CreatePortDto) {
    return this.ports.create(user, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: PortActor | undefined, @Param('id') id: string) {
    return this.ports.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: PortActor | undefined,
    @Param('id') id: string,
    @Body() dto: UpdatePortDto,
  ) {
    return this.ports.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: PortActor | undefined, @Param('id') id: string) {
    return this.ports.remove(user, id);
  }
}
