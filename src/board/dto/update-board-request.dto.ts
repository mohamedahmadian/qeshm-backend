import { PartialType } from '@nestjs/mapped-types';
import { CreateBoardRequestDto } from './create-board-request.dto';

export class UpdateBoardRequestDto extends PartialType(CreateBoardRequestDto) {}
