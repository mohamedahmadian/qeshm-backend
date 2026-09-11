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
import { ContractorsService } from './contractors.service';
import { CreateGlobalContractorDto } from './dto/create-contractor.dto';
import { CreateContractorProjectDto } from './dto/create-contractor-project.dto';
import {
  FindContractorProjectsQueryDto,
  FindContractorsQueryDto,
} from './dto/find-contractors-query.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';

@Controller('contractors')
export class GlobalContractorsController {
  constructor(private readonly contractors: ContractorsService) {}

  @Get()
  findAll(@Query() query: FindContractorsQueryDto) {
    return this.contractors.findAll(undefined, query);
  }

  @Post()
  create(@Body() dto: CreateGlobalContractorDto) {
    return this.contractors.create(dto.projectId, dto);
  }

  @Get(':id/projects')
  findProjects(
    @Param('id') id: string,
    @Query() query: FindContractorProjectsQueryDto,
  ) {
    return this.contractors.findProjects(id, query);
  }

  @Post(':id/projects')
  addProject(
    @Param('id') id: string,
    @Body() dto: CreateContractorProjectDto,
  ) {
    return this.contractors.addProject(id, dto.projectId);
  }

  @Delete(':id/projects/:projectId')
  removeProject(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
  ) {
    return this.contractors.removeProject(id, projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractors.findOne(undefined, id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContractorDto) {
    return this.contractors.update(undefined, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contractors.remove(undefined, id);
  }
}
