import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BoardMinutesService } from './board-minutes.service';
import { CreateBoardMinutesDto } from './dto/create-board-minutes.dto';
import { CreateBoardResolutionDto } from './dto/create-board-resolution.dto';
import { CreateBoardResolutionProgressDto } from './dto/create-board-resolution-progress.dto';
import { FindBoardMinutesQueryDto } from './dto/find-board-minutes-query.dto';
import { FindBoardResolutionsQueryDto } from './dto/find-board-resolutions-query.dto';
import { SendBoardMinutesSmsDto } from './dto/send-board-minutes-sms.dto';
import { SendBoardResolutionSmsDto } from './dto/send-board-resolution-sms.dto';
import { UpdateBoardMinutesDto } from './dto/update-board-minutes.dto';
import { UpdateBoardResolutionDto } from './dto/update-board-resolution.dto';
import { UpdateBoardResolutionProgressDto } from './dto/update-board-resolution-progress.dto';

type RequestUser = { id: string };

@Controller('board/minutes')
export class BoardMinutesController {
  constructor(private readonly minutes: BoardMinutesService) {}

  @Get('stats')
  stats(@CurrentUser() user: RequestUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.stats(user.id);
  }

  @Get('approved-requests')
  approvedRequests(@CurrentUser() user: RequestUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.approvedRequests(user.id);
  }

  @Get()
  findAll(
    @Query() query: FindBoardMinutesQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.findAll(query, user.id);
  }

  @Post()
  create(
    @Body() dto: CreateBoardMinutesDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.create(dto, user.id);
  }

  @Get(':id/resolutions')
  findResolutions(
    @Param('id') id: string,
    @Query() query: FindBoardResolutionsQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.findResolutions(id, query, user.id);
  }

  @Post(':id/resolutions')
  createResolution(
    @Param('id') id: string,
    @Body() dto: CreateBoardResolutionDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.createResolution(id, dto, user.id);
  }

  @Get(':id/resolutions/:resolutionId')
  findResolution(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.findResolution(id, resolutionId, user.id);
  }

  @Patch(':id/resolutions/:resolutionId')
  updateResolution(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @Body() dto: UpdateBoardResolutionDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.updateResolution(id, resolutionId, dto, user.id);
  }

  @Delete(':id/resolutions/:resolutionId')
  removeResolution(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.removeResolution(id, resolutionId, user.id);
  }

  @Get(':id/resolutions/:resolutionId/progress')
  findProgressReports(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.findProgressReports(id, resolutionId, user.id);
  }

  @Post(':id/resolutions/:resolutionId/progress')
  createProgressReport(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @Body() dto: CreateBoardResolutionProgressDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.createProgressReport(id, resolutionId, dto, user.id);
  }

  @Patch(':id/resolutions/:resolutionId/progress/:reportId')
  updateProgressReport(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateBoardResolutionProgressDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.updateProgressReport(id, resolutionId, reportId, dto, user.id);
  }

  @Delete(':id/resolutions/:resolutionId/progress/:reportId')
  removeProgressReport(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.removeProgressReport(id, resolutionId, reportId, user.id);
  }

  @Post(':id/resolutions/:resolutionId/sms')
  sendResolutionSms(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @Body() dto: SendBoardResolutionSmsDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.sendResolutionSms(id, resolutionId, dto, user.id);
  }

  @Post(':id/sms')
  sendSms(
    @Param('id') id: string,
    @Body() dto: SendBoardMinutesSmsDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.sendSms(id, dto, user.id);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBoardMinutesDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.update(id, dto, user.id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.remove(id, user.id);
  }
}
