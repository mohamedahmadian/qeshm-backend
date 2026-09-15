import { Module } from '@nestjs/common';
import { BoardController } from './board.controller';
import { BoardMinutesController } from './board-minutes.controller';
import { BoardMinutesService } from './board-minutes.service';
import { BoardService } from './board.service';

@Module({
  controllers: [BoardController, BoardMinutesController],
  providers: [BoardService, BoardMinutesService],
})
export class BoardModule {}
