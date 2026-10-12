import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/pagination';
import { AdvancedFoodOrdersService } from './advanced-food-orders.service';
import { CreateAdvancedFoodOrderDto } from './dto/create-advanced-food-order.dto';
import {
  AdvancedFoodWeekMenuQueryDto,
  FindAdvancedFoodOrdersQueryDto,
} from './dto/find-advanced-food-orders-query.dto';

type RequestUser = { id: string };

@Controller('advanced-food-orders')
export class AdvancedFoodOrdersController {
  constructor(private readonly orders: AdvancedFoodOrdersService) {}

  @Get('context')
  context(@CurrentUser() user: RequestUser | undefined) {
    if (!user?.id) throw new UnauthorizedException();
    return this.orders.context();
  }

  @Get('week-menu')
  weekMenu(
    @Query() query: AdvancedFoodWeekMenuQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.orders.weekMenu(query.restaurantId);
  }

  @Get()
  findAll(
    @Query() query: FindAdvancedFoodOrdersQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.orders.findAll(query);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: CreateAdvancedFoodOrderDto,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.orders.create(user.id, dto);
  }

  @Get(':id/reservations')
  findReservations(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.orders.findReservations(id, query);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.orders.findOne(id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.orders.remove(id);
  }
}
