import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtUserInterceptor } from './auth/jwt-user.interceptor';
import { FoodReservationModule } from './food-reservation/food-reservation.module';
import { GeoModule } from './geo/geo.module';
import { ImagesModule } from './images/images.module';
import { OrganizationModule } from './organization/organization.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { SmsModule } from './sms/sms.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    GeoModule,
    ProjectsModule,
    FoodReservationModule,
    OrganizationModule,
    VehiclesModule,
    ImagesModule,
    SmsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: JwtUserInterceptor,
    },
  ],
})
export class AppModule {}
