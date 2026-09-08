import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SmsModule } from '../sms/sms.module';
import { AccountController } from './account.controller';
import { PublicAuthController } from './public-auth.controller';
import { PublicProfilesController } from './public-profiles.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, SmsModule],
  controllers: [
    AccountController,
    PublicAuthController,
    PublicProfilesController,
    UsersController,
  ],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
