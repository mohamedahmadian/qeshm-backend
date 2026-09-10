import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AccessModule } from './access/access.module';
import { PermissionsGuard } from './access/permissions.guard';
import { AuthModule } from './auth/auth.module';
import { JwtUserGuard } from './auth/jwt-user.guard';
import { FoodReservationModule } from './food-reservation/food-reservation.module';
import { GeoModule } from './geo/geo.module';
import { FilesModule } from './files/files.module';
import { ImagesModule } from './images/images.module';
import { OrganizationModule } from './organization/organization.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RolesModule } from './roles/roles.module';
import { SmsModule } from './sms/sms.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccessModule,
    AuthModule,
    UsersModule,
    RolesModule,
    GeoModule,
    ProjectsModule,
    FoodReservationModule,
    OrganizationModule,
    VehiclesModule,
    ImagesModule,
    FilesModule,
    SmsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtUserGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
