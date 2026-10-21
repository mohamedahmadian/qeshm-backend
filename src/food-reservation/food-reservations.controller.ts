import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FOOD_ADMIN_ROLE_CODE } from '../access/access.constants';
import { hasAnyPermission, hasPermission } from '../access/access.util';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateFoodReservationBatchDto } from './dto/create-food-reservation-batch.dto';
import { CreateFoodReservationDto } from './dto/create-food-reservation.dto';
import { FindFoodReservationsQueryDto } from './dto/find-food-reservations-query.dto';
import { FoodReservationRangeActionDto } from './dto/food-reservation-range-action.dto';
import {
  FoodReservationLastQuantityQueryDto,
  FoodReservationMenuQueryDto,
  FoodReservationWeekMenuQueryDto,
} from './dto/food-reservation-menu-query.dto';
import { MineFoodSummaryQueryDto } from './dto/mine-food-summary-query.dto';
import { FindDailyFoodReportQueryDto } from './dto/find-daily-food-report-query.dto';
import { FoodDailyReportService } from './food-daily-report.service';
import { FoodReservationsService } from './food-reservations.service';

type RequestUser = {
  id: string;
  isAdmin?: boolean;
  roleCodes?: string[];
  permissionCodes?: string[];
};

const ORG_FOOD_RESERVATION_PERMISSIONS = [
  'food-reservation.history',
  'food-reservation.report',
  'food-reservation.cost-estimate',
];

function foodAccess(user: RequestUser) {
  return {
    isAdmin: Boolean(user.isAdmin),
    permissionCodes: user.permissionCodes ?? [],
  };
}

function canSeeAllFoodReservations(user: RequestUser) {
  return hasAnyPermission(foodAccess(user), ORG_FOOD_RESERVATION_PERMISSIONS);
}

/** مدیریت، مدیر ماژول غذا، یا نقشی که کل ماژول غذا را دارد و می‌تواند واحد انتخاب کند. */
function canManageFoodReservations(user: RequestUser) {
  return (
    hasPermission(foodAccess(user), 'food-reservation') ||
    Boolean(user.roleCodes?.includes(FOOD_ADMIN_ROLE_CODE))
  );
}

@Controller('food-reservations')
export class FoodReservationsController {
  constructor(
    private readonly reservations: FoodReservationsService,
    private readonly dailyReport: FoodDailyReportService,
  ) {}

  @Get('context')
  context(@CurrentUser() user: RequestUser | undefined) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.context(user.id, canManageFoodReservations(user));
  }

  @Get('last-quantity')
  lastQuantity(
    @Query() query: FoodReservationLastQuantityQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.lastQuantity(
      user.id,
      query,
      canManageFoodReservations(user),
    );
  }

  @Get('menu')
  menu(
    @Query() query: FoodReservationMenuQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.menu(user.id, query, canManageFoodReservations(user));
  }

  @Get('week-menu')
  weekMenu(
    @Query() query: FoodReservationWeekMenuQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.weekMenu(
      user.id,
      query,
      canManageFoodReservations(user),
    );
  }

  @Get('report')
  report(@Query() query: FindFoodReservationsQueryDto) {
    return this.reservations.report(query);
  }

  @Get('cost-estimate')
  costEstimate(@Query() query: FindFoodReservationsQueryDto) {
    return this.reservations.costEstimate(query);
  }

  @Get('unit-report')
  unitReport(@Query() query: FindFoodReservationsQueryDto) {
    return this.reservations.unitReport(query);
  }

  @Get('daily-report')
  getDailyReport(@Query() query: FindDailyFoodReportQueryDto) {
    return this.dailyReport.report(query);
  }

  @Get('daily-report/export')
  async exportDailyReport(
    @Query() query: FindDailyFoodReportQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.dailyReport.exportReport(query);
    const ascii = file.fileName.replace(/[^\w.\-]+/g, '_') || 'food-daily-report.xlsx';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.send(file.buffer);
  }

  @Get('mine/summary')
  mineSummary(
    @Query() query: MineFoodSummaryQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.mineSummary(user.id, query);
  }

  @Get()
  findAll(
    @Query() query: FindFoodReservationsQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    if (!canSeeAllFoodReservations(user)) {
      query.mine = true;
      query.userId = undefined;
    }
    return this.reservations.findAll(query, user.id);
  }

  @Get('export')
  async exportAll(
    @Query() query: FindFoodReservationsQueryDto,
    @CurrentUser() user: RequestUser | undefined,
    @Res() res: Response,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    if (!canSeeAllFoodReservations(user)) {
      query.mine = true;
      query.userId = undefined;
    }
    const file = await this.reservations.exportAll(query, user.id);
    const ascii = file.fileName.replace(/[^\w.\-]+/g, '_') || 'food-reservations.xlsx';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.send(file.buffer);
  }

  @Post('confirm-range')
  confirmRange(
    @Body() dto: FoodReservationRangeActionDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    if (!canSeeAllFoodReservations(user)) {
      throw new ForbiddenException('دسترسی مجاز نیست');
    }
    return this.reservations.confirmRange(dto);
  }

  @Post('delete-all')
  deleteAll(@CurrentUser() user: RequestUser | undefined) {
    if (!user?.id) throw new UnauthorizedException();
    if (!canSeeAllFoodReservations(user)) {
      throw new ForbiddenException('دسترسی مجاز نیست');
    }
    return this.reservations.deleteAll();
  }

  @Post('cancel-range')
  cancelRange(
    @Body() dto: FoodReservationRangeActionDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    if (!canSeeAllFoodReservations(user)) {
      throw new ForbiddenException('دسترسی مجاز نیست');
    }
    return this.reservations.cancelRange(dto);
  }

  @Post('batch')
  createBatch(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: CreateFoodReservationBatchDto,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.createBatch(user.id, dto, canManageFoodReservations(user));
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: CreateFoodReservationDto,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.create(user.id, dto, canManageFoodReservations(user));
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('mine') mine: string | undefined,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    const mineOnly =
      !canSeeAllFoodReservations(user) || mine === 'true' || mine === '1';
    return this.reservations.findOne(id, user.id, mineOnly);
  }

  @Patch(':id/confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    if (!canSeeAllFoodReservations(user)) {
      throw new ForbiddenException('دسترسی مجاز نیست');
    }
    return this.reservations.confirm(id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('mine') mine: string | undefined,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    const mineOnly =
      !canSeeAllFoodReservations(user) || mine === 'true' || mine === '1';
    return this.reservations.remove(id, user.id, mineOnly);
  }
}
