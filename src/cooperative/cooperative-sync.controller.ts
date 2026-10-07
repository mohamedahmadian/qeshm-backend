import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { CooperativeAuthGuard } from './cooperative-auth.guard';
import { CooperativeExceptionFilter } from './cooperative-response';
import { CooperativeSyncService } from './cooperative-sync.service';
import {
  CooperativeChangesQueryDto,
  CooperativeFullQueryDto,
} from './dto/cooperative-sync-query.dto';

@Controller('cooperative/qeshmondi/sync')
@UseGuards(CooperativeAuthGuard)
@UseFilters(CooperativeExceptionFilter)
export class CooperativeSyncController {
  constructor(private readonly sync: CooperativeSyncService) {}

  @Get('status')
  status() {
    return this.sync.status();
  }

  @Get('full')
  full(@Query() query: CooperativeFullQueryDto) {
    return this.sync.full(query);
  }

  @Get('changes')
  changes(@Query() query: CooperativeChangesQueryDto) {
    return this.sync.changes(query);
  }
}
