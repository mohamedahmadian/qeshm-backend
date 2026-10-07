import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { CooperativeAuthGuard } from './cooperative-auth.guard';
import { CooperativeExceptionFilter } from './cooperative-response';
import { CooperativeSyncService } from './cooperative-sync.service';
import { CooperativeInquiryQueryDto } from './dto/cooperative-inquiry-query.dto';

@Controller('cooperative/qeshmondi')
@UseGuards(CooperativeAuthGuard)
@UseFilters(CooperativeExceptionFilter)
export class CooperativeInquiryController {
  constructor(private readonly sync: CooperativeSyncService) {}

  @Get('inquiry')
  inquiry(@Query() query: CooperativeInquiryQueryDto) {
    return this.sync.inquiry(query);
  }
}
