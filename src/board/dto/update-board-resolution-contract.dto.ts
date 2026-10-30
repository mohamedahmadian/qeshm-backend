import { PartialType } from '@nestjs/mapped-types';
import { CreateBoardResolutionContractDto } from './create-board-resolution-contract.dto';

export class UpdateBoardResolutionContractDto extends PartialType(
  CreateBoardResolutionContractDto,
) {}
