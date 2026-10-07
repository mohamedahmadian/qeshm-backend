import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CooperativeAuthController } from './cooperative-auth.controller';
import { CooperativeAuthGuard } from './cooperative-auth.guard';
import { CooperativeAuthService } from './cooperative-auth.service';
import { CooperativeInquiryController } from './cooperative-inquiry.controller';
import { CooperativeSyncController } from './cooperative-sync.controller';
import { CooperativeSyncService } from './cooperative-sync.service';

@Module({
  imports: [AuthModule],
  controllers: [CooperativeAuthController, CooperativeInquiryController, CooperativeSyncController],
  providers: [CooperativeAuthService, CooperativeAuthGuard, CooperativeSyncService],
})
export class CooperativeModule {}
