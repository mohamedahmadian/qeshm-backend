import { PartialType } from '@nestjs/mapped-types';
import { CreateBoardResolutionProgressDto } from './create-board-resolution-progress.dto';

export class UpdateBoardResolutionProgressDto extends PartialType(
  CreateBoardResolutionProgressDto,
) {}
