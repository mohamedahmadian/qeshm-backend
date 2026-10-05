import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SmsModule } from '../sms/sms.module';
import { AccountController } from './account.controller';
import { PublicAuthController } from './public-auth.controller';
import { PublicProfilesController } from './public-profiles.controller';
import { QeshmondiSyncController } from './qeshmondi-sync.controller';
import { QeshmondiSyncService } from './qeshmondi-sync.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, SmsModule],
  controllers: [
    AccountController,
    PublicAuthController,
    PublicProfilesController,
    QeshmondiSyncController,
    UsersController,
  ],
  providers: [UsersService, QeshmondiSyncService],
  exports: [UsersService],
})
export class UsersModule {}
