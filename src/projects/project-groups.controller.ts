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
import { CreateProjectGroupDto } from './dto/create-project-group.dto';
import { FindProjectGroupsQueryDto } from './dto/find-project-groups-query.dto';
import { UpdateProjectGroupDto } from './dto/update-project-group.dto';
import { ProjectGroupsService } from './project-groups.service';

@Controller('projects/groups')
export class ProjectGroupsController {
  constructor(private readonly groups: ProjectGroupsService) {}

  @Get()
  findAll(@Query() query: FindProjectGroupsQueryDto) {
    return this.groups.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateProjectGroupDto) {
    return this.groups.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.groups.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectGroupDto) {
    return this.groups.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }
}
