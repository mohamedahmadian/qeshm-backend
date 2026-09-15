import { PartialType } from '@nestjs/mapped-types';
import { CreateBoardMinutesDto } from './create-board-minutes.dto';

export class UpdateBoardMinutesDto extends PartialType(CreateBoardMinutesDto) {}
