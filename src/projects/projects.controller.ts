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
import { CreateProjectDto } from './dto/create-project.dto';
import { FindProjectsQueryDto } from './dto/find-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectReportsService } from './project-reports.service';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly reports: ProjectReportsService,
  ) {}

  @Get()
  findAll(@Query() query: FindProjectsQueryDto) {
    return this.projects.findAll(query);
  }

  @Get('lookups')
  lookups(@Query() query: FindProjectsQueryDto) {
    return this.projects.lookups(query);
  }

  @Get('reports')
  reportsOverview(@Query() query: FindProjectsQueryDto) {
    return this.reports.overview(query);
  }

  @Get('live-board')
  liveBoard(@Query() query: FindProjectsQueryDto) {
    return this.projects.liveBoard(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projects.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }
}
