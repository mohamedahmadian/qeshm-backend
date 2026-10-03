import { Module } from '@nestjs/common';
import { TicketTariffsController } from './ticket-tariffs.controller';
import { TicketTariffsService } from './ticket-tariffs.service';

@Module({
  controllers: [TicketTariffsController],
  providers: [TicketTariffsService],
})
export class TicketTariffsModule {}
