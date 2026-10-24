import { Module } from '@nestjs/common';
import { BoardController } from './board.controller';
import { BoardMinutesController } from './board-minutes.controller';
import { BoardMinutesService } from './board-minutes.service';
import { BoardReportsService } from './board-reports.service';
import { BoardService } from './board.service';
import { BoardSignatoriesController } from './board-signatories.controller';
import { BoardSignatoriesService } from './board-signatories.service';

@Module({
  controllers: [BoardController, BoardMinutesController, BoardSignatoriesController],
  providers: [BoardService, BoardMinutesService, BoardReportsService, BoardSignatoriesService],
})
export class BoardModule {}
