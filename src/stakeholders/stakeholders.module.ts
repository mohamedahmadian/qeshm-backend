import { Module } from '@nestjs/common';
import { StakeholdersAccess } from './stakeholders.access';
import {
  StakeholderContractorsController,
  StakeholderCorrespondenceController,
  StakeholderInboxController,
  StakeholderProgressController,
  StakeholderProjectsController,
  StakeholderReportsController,
  StakeholderResolutionContractsController,
  StakeholderResolutionProgressController,
} from './stakeholders.controller';
import { StakeholdersService } from './stakeholders.service';

@Module({
  controllers: [
    StakeholderContractorsController,
    StakeholderProjectsController,
    StakeholderProgressController,
    StakeholderReportsController,
    StakeholderResolutionContractsController,
    StakeholderResolutionProgressController,
    StakeholderCorrespondenceController,
    StakeholderInboxController,
  ],
  providers: [StakeholdersAccess, StakeholdersService],
})
export class StakeholdersModule {}
