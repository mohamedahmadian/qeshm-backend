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
import { CreateProjectPhaseDto } from './dto/create-project-phase.dto';
import { FindProjectPhasesQueryDto } from './dto/find-project-phases-query.dto';
import { UpdateProjectPhaseDto } from './dto/update-project-phase.dto';
import { ProjectPhasesService } from './project-phases.service';

@Controller('projects/:projectId/phases')
export class ProjectPhasesController {
  constructor(private readonly phases: ProjectPhasesService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query() query: FindProjectPhasesQueryDto,
  ) {
    return this.phases.findAll(projectId, query);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectPhaseDto,
  ) {
    return this.phases.create(projectId, dto);
  }

  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.phases.findOne(projectId, id);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectPhaseDto,
  ) {
    return this.phases.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.phases.remove(projectId, id);
  }
}
