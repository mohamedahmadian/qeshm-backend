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
import { CreateFoodReservationDto } from './dto/create-food-reservation.dto';
import { FindFoodReservationsQueryDto } from './dto/find-food-reservations-query.dto';
import { FoodReservationsService } from './food-reservations.service';

type RequestUser = { id: string };

@Controller('food-reservations')
export class FoodReservationsController {
  constructor(private readonly reservations: FoodReservationsService) {}

  @Get('context')
  context(@CurrentUser() user: RequestUser | undefined) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.context(user.id);
  }

  @Get('report')
  report(@Query() query: FindFoodReservationsQueryDto) {
    return this.reservations.report(query);
  }

  @Get()
  findAll(
    @Query() query: FindFoodReservationsQueryDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.reservations.findAll(query, user?.id);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: CreateFoodReservationDto,
  ) {
    if (!user?.id) throw new UnauthorizedException();
    return this.reservations.create(user.id, dto);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('mine') mine: string | undefined,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.reservations.findOne(id, user?.id, mine === 'true' || mine === '1');
  }

  @Patch(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.reservations.confirm(id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Query('mine') mine: string | undefined,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.reservations.remove(
      id,
      user?.id,
      mine === 'true' || mine === '1',
    );
  }
}
