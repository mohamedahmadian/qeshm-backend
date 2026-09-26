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
import { CreateProjectChecklistItemDto } from './dto/create-project-checklist-item.dto';
import { FindProjectChecklistQueryDto } from './dto/find-project-checklist-query.dto';
import { UpdateProjectChecklistItemDto } from './dto/update-project-checklist-item.dto';
import { ProjectChecklistService } from './project-checklist.service';

@Controller('projects/:projectId/checklist')
export class ProjectChecklistController {
  constructor(private readonly checklist: ProjectChecklistService) {}

  @Get('summary')
  summary(@Param('projectId') projectId: string) {
    return this.checklist.summary(projectId, null);
  }

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query() query: FindProjectChecklistQueryDto,
  ) {
    return this.checklist.findAll(projectId, null, query);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectChecklistItemDto,
  ) {
    return this.checklist.create(projectId, null, dto);
  }

  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.checklist.findOne(projectId, null, id);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectChecklistItemDto,
  ) {
    return this.checklist.update(projectId, null, id, dto);
  }

  @Delete(':id')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.checklist.remove(projectId, null, id);
  }
}

@Controller('projects/:projectId/phases/:phaseId/checklist')
export class ProjectPhaseChecklistController {
  constructor(private readonly checklist: ProjectChecklistService) {}

  @Get('summary')
  summary(
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.checklist.summary(projectId, phaseId);
  }

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Query() query: FindProjectChecklistQueryDto,
  ) {
    return this.checklist.findAll(projectId, phaseId, query);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: CreateProjectChecklistItemDto,
  ) {
    return this.checklist.create(projectId, phaseId, dto);
  }

  @Get(':id')
  findOne(
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Param('id') id: string,
  ) {
    return this.checklist.findOne(projectId, phaseId, id);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectChecklistItemDto,
  ) {
    return this.checklist.update(projectId, phaseId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Param('id') id: string,
  ) {
    return this.checklist.remove(projectId, phaseId, id);
  }
}
