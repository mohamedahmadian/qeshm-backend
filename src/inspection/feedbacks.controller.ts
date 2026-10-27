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
import { CreateInspectionActivityDto } from './dto/create-activity.dto';
import { CreateInspectionFeedbackDto } from './dto/create-feedback.dto';
import { FindInspectionFeedbacksQueryDto } from './dto/find-feedbacks-query.dto';
import { ReplyInspectionFeedbackDto } from './dto/reply-feedback.dto';
import { UpdateInspectionActivityDto } from './dto/update-activity.dto';
import { UpdateInspectionFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { InspectionFeedbacksService } from './feedbacks.service';

type RequestUser = { id: string };

@Controller('inspection')
export class InspectionFeedbacksController {
  constructor(private readonly feedbacks: InspectionFeedbacksService) {}

  @Get('reports')
  reports(@Query() query: FindInspectionFeedbacksQueryDto) {
    return this.feedbacks.reports(query);
  }

  @Get('mine')
  mine(
    @Query() query: FindInspectionFeedbacksQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.feedbacks.findAll(query, user.id);
  }

  @Get('mine/:id')
  mineOne(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.feedbacks.findOne(id, user.id);
  }

  @Post('mine')
  createMine(
    @Body() dto: CreateInspectionFeedbackDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.feedbacks.create(dto, user.id);
  }

  @Get('feedbacks')
  findAll(@Query() query: FindInspectionFeedbacksQueryDto) {
    return this.feedbacks.findAll(query);
  }

  @Get('feedbacks/:id')
  findOne(@Param('id') id: string) {
    return this.feedbacks.findOne(id);
  }

  @Patch('feedbacks/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateInspectionFeedbackStatusDto,
  ) {
    return this.feedbacks.updateStatus(id, dto);
  }

  @Post('feedbacks/:id/reply')
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyInspectionFeedbackDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.feedbacks.reply(id, dto, user.id);
  }

  @Post('feedbacks/:id/activities')
  createActivity(
    @Param('id') id: string,
    @Body() dto: CreateInspectionActivityDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.feedbacks.createActivity(id, dto, user.id);
  }

  @Get('feedbacks/:id/activities/:activityId')
  findActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
  ) {
    return this.feedbacks.findActivity(id, activityId);
  }

  @Patch('feedbacks/:id/activities/:activityId')
  updateActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateInspectionActivityDto,
  ) {
    return this.feedbacks.updateActivity(id, activityId, dto);
  }

  @Delete('feedbacks/:id/activities/:activityId')
  removeActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
  ) {
    return this.feedbacks.removeActivity(id, activityId);
  }

  @Delete('feedbacks/:id')
  remove(@Param('id') id: string) {
    return this.feedbacks.remove(id);
  }
}
