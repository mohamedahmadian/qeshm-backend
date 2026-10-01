import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { hasAnyPermission } from '../access/access.util';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateFoodReservationDto } from './dto/create-food-reservation.dto';
import { FindFoodReservationsQueryDto } from './dto/find-food-reservations-query.dto';
import { FoodReservationRangeActionDto } from './dto/food-reservation-range-action.dto';
import {
  FoodReservationLastQuantityQueryDto,
  FoodReservationMenuQueryDto,
} from './dto/food-reservation-menu-query.dto';
import { MineFoodSummaryQueryDto } from './dto/mine-food-summary-query.dto';
import { FoodReservationsService } from './food-reservations.service';

type RequestUser = {
  id: string;
  isAdmin?: boolean;
  permissionCodes?: string[];
};

const ORG_FOOD_RESERVATION_PERMISSIONS = [
  'food-reservation.history',
  'food-reservation.report',
  'food-reservation.cost-estimate',
];

function canSeeAllFoodReservations(user: RequestUser) {
  return hasAnyPermission(
    {
      isAdmin: Boolean(user.isAdmin),
      permissionCodes: user.permissionCodes ?? [],
    },
    ORG_FOOD_RESERVATION_PERMISSIONS,
  );
}

@Controller('food-reservations')
export class FoodReservationsController {
  constructor(private readonly reservations: FoodReservationsService) {}

  @Get('context')
  context(@CurrentUser() user: RequestUser | undefined) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.context(user.id, Boolean(user.isAdmin));
  }

  @Get('last-quantity')
  lastQuantity(
    @Query() query: FoodReservationLastQuantityQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.lastQuantity(user.id, query, Boolean(user.isAdmin));
  }

  @Get('menu')
  menu(
    @Query() query: FoodReservationMenuQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.menu(user.id, query, Boolean(user.isAdmin));
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

  @Post()
  create(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: CreateFoodReservationDto,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.create(user.id, dto, Boolean(user.isAdmin));
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
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
    @Param('id') id: string,
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
    @Param('id') id: string,
    @Query('mine') mine: string | undefined,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    const mineOnly =
      !canSeeAllFoodReservations(user) || mine === 'true' || mine === '1';
    return this.reservations.remove(id, user.id, mineOnly);
  }
}
