import { Module } from '@nestjs/common';
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

@Module({
  controllers: [
    FoodsController,
    RestaurantsController,
    RestaurantMenuController,
    RestaurantUnitsController,
    FoodReservationsController,
  ],
  providers: [
    FoodsService,
    RestaurantsService,
    RestaurantMenuService,
    RestaurantUnitsService,
    FoodReservationsService,
  ],
})
export class FoodReservationModule {}
