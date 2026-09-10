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
import { CreateProjectProgressDto } from './dto/create-project-progress.dto';
import { FindProjectProgressQueryDto } from './dto/find-project-progress-query.dto';
import { UpdateProjectProgressDto } from './dto/update-project-progress.dto';
import { ProjectProgressService } from './project-progress.service';

@Controller('projects/:projectId/progress')
export class ProjectProgressController {
  constructor(private readonly progress: ProjectProgressService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query() query: FindProjectProgressQueryDto,
  ) {
    return this.progress.findAll(projectId, query);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectProgressDto,
  ) {
    return this.progress.create(projectId, dto);
  }

  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.progress.findOne(projectId, id);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectProgressDto,
  ) {
    return this.progress.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.progress.remove(projectId, id);
  }

  @Post(':id/process')
  process(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.progress.process(projectId, id);
  }
}
