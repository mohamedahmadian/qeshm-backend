import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateCorrespondenceDto,
  CreateProgressReportDto,
  CreateStakeholderMessageDto,
  FindCorrespondencesQueryDto,
  FindPortalProjectsQueryDto,
  FindProgressReportsQueryDto,
  UpdateCorrespondenceDto,
  UpdateCorrespondenceWorkflowDto,
  UpdateProgressReportDto,
} from './dto/stakeholder.dto';
import { StakeholdersService } from './stakeholders.service';

type Actor = { id?: string };

@Controller('stakeholders/contractors')
export class StakeholderContractorsController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  list() {
    return this.stakeholders.listContractors();
  }
}

@Controller('stakeholders/projects')
export class StakeholderProjectsController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  list(@CurrentUser() user: Actor | undefined, @Query() query: FindPortalProjectsQueryDto) {
    return this.stakeholders.listProjects(user?.id, query);
  }

  @Get('options')
  options(@CurrentUser() user: Actor | undefined) {
    return this.stakeholders.projectOptions(user?.id);
  }

  @Get(':id')
  find(@CurrentUser() user: Actor | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.stakeholders.findProject(user?.id, id);
  }
}

@Controller('stakeholders/progress')
export class StakeholderProgressController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  list(@CurrentUser() user: Actor | undefined, @Query() query: FindProgressReportsQueryDto) {
    return this.stakeholders.listProgress(user?.id, query);
  }

  @Post()
  create(@CurrentUser() user: Actor | undefined, @Body() dto: CreateProgressReportDto) {
    return this.stakeholders.createProgress(user?.id, dto);
  }

  @Get(':id')
  find(@CurrentUser() user: Actor | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.stakeholders.findProgress(user?.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: Actor | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgressReportDto,
  ) {
    return this.stakeholders.updateProgress(user?.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: Actor | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.stakeholders.removeProgress(user?.id, id);
  }
}

@Controller('stakeholders/reports')
export class StakeholderReportsController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  list(@CurrentUser() user: Actor | undefined, @Query() query: FindProgressReportsQueryDto) {
    return this.stakeholders.listProgress(user?.id, query);
  }

  @Get(':id')
  find(@CurrentUser() user: Actor | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.stakeholders.findProgress(user?.id, id);
  }
}

@Controller('stakeholders/correspondence')
export class StakeholderCorrespondenceController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  list(@CurrentUser() user: Actor | undefined, @Query() query: FindCorrespondencesQueryDto) {
    return this.stakeholders.listCorrespondences(user?.id, query);
  }

  @Post()
  create(@CurrentUser() user: Actor | undefined, @Body() dto: CreateCorrespondenceDto) {
    return this.stakeholders.createCorrespondence(user?.id, dto);
  }

  @Get(':id')
  find(@CurrentUser() user: Actor | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.stakeholders.findCorrespondence(user?.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: Actor | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCorrespondenceDto,
  ) {
    return this.stakeholders.updateCorrespondence(user?.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: Actor | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.stakeholders.removeCorrespondence(user?.id, id);
  }

  @Post(':id/messages')
  message(
    @CurrentUser() user: Actor | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStakeholderMessageDto,
  ) {
    return this.stakeholders.addMessage(user?.id, id, dto);
  }
}

@Controller('stakeholders/inbox')
export class StakeholderInboxController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  list(@CurrentUser() user: Actor | undefined, @Query() query: FindCorrespondencesQueryDto) {
    return this.stakeholders.listCorrespondences(user?.id, query);
  }

  @Get(':id')
  find(@CurrentUser() user: Actor | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.stakeholders.findCorrespondence(user?.id, id);
  }

  @Patch(':id')
  workflow(
    @CurrentUser() user: Actor | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCorrespondenceWorkflowDto,
  ) {
    return this.stakeholders.updateWorkflow(user?.id, id, dto);
  }

  @Post(':id/messages')
  message(
    @CurrentUser() user: Actor | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStakeholderMessageDto,
  ) {
    return this.stakeholders.addMessage(user?.id, id, dto);
  }
}
