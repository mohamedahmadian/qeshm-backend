import { PartialType } from '@nestjs/mapped-types';
import { CreateBoardResolutionDto } from './create-board-resolution.dto';

export class UpdateBoardResolutionDto extends PartialType(CreateBoardResolutionDto) {}
