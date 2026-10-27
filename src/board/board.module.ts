import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { BoardController } from './board.controller';
import { BoardMinutesController } from './board-minutes.controller';
import { BoardMinutesService } from './board-minutes.service';
import { BoardReportsService } from './board-reports.service';
import { BoardService } from './board.service';
import { BoardSignatoriesController } from './board-signatories.controller';
import { BoardSignatoriesService } from './board-signatories.service';

@Module({
  imports: [SmsModule],
  controllers: [BoardController, BoardMinutesController, BoardSignatoriesController],
  providers: [BoardService, BoardMinutesService, BoardReportsService, BoardSignatoriesService],
})
export class BoardModule {}
