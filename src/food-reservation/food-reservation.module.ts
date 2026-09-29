import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FoodReservationsController } from './food-reservations.controller';
import { FoodReservationsService } from './food-reservations.service';
import { FoodsController } from './foods.controller';
import { FoodsService } from './foods.service';
import { RestaurantMenuController } from './restaurant-menu.controller';
import { RestaurantMenuService } from './restaurant-menu.service';
import { RestaurantUnitsController } from './restaurant-units.controller';
import { RestaurantUnitsService } from './restaurant-units.service';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { UnitRepsController } from './unit-reps.controller';
import { UnitRepsService } from './unit-reps.service';

@Module({
  imports: [UsersModule],
  controllers: [
    FoodsController,
    RestaurantsController,
    RestaurantMenuController,
    RestaurantUnitsController,
    FoodReservationsController,
    UnitRepsController,
  ],
  providers: [
    FoodsService,
    RestaurantsService,
    RestaurantMenuService,
    RestaurantUnitsService,
    FoodReservationsService,
    UnitRepsService,
  ],
})
export class FoodReservationModule {}
