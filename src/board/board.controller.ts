import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BoardMinutesService } from './board-minutes.service';
import { BoardService } from './board.service';
import {
  ReviewBoardRequestDto,
  UpdateBoardPermissionsDto,
  UpdateBoardRequestStatusDto,
} from './dto/board-actions.dto';
import { CreateBoardRequestDto } from './dto/create-board-request.dto';
import { FindBoardRequestsQueryDto } from './dto/find-board-requests-query.dto';
import { FindBoardResolutionsQueryDto } from './dto/find-board-resolutions-query.dto';
import { UpdateBoardRequestDto } from './dto/update-board-request.dto';

type RequestUser = { id: string };

@Controller('board')
export class BoardController {
  constructor(
    private readonly board: BoardService,
    private readonly minutes: BoardMinutesService,
  ) {}

  @Get('access')
  access(@CurrentUser() user: RequestUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.board.access(user.id);
  }

  @Get('permissions')
  permissions(@CurrentUser() user: RequestUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.board.getPermissions(user.id);
  }

  @Put('permissions')
  updatePermissions(
    @Body() dto: UpdateBoardPermissionsDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.board.updatePermissions(user.id, dto);
  }

  @Get('resolutions')
  resolutions(
    @Query() query: FindBoardResolutionsQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.minutes.findAllResolutions(query, user.id);
  }

  @Get('plans/stats')
  stats(@CurrentUser() user: RequestUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.board.stats(user.id);
  }

  @Get('plans')
  plans(
    @Query() query: FindBoardRequestsQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.board.findPlans(query, user.id);
  }

  @Get('requests')
  mine(
    @Query() query: FindBoardRequestsQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.board.findMine(query, user.id);
  }

  @Post('requests')
  create(
    @Body() dto: CreateBoardRequestDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.board.create(dto, user.id);
  }

  @Get('requests/:id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.board.findOne(id, user.id);
  }

  @Patch('requests/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBoardRequestDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.board.update(id, dto, user.id);
  }

  @Post('requests/:id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewBoardRequestDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.board.review(id, dto, user.id);
  }

  @Patch('requests/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBoardRequestStatusDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.board.updateStatus(id, dto, user.id);
  }
}
