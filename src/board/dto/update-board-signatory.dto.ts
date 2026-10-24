import { PartialType } from '@nestjs/mapped-types';
import { CreateBoardSignatoryDto } from './create-board-signatory.dto';

export class UpdateBoardSignatoryDto extends PartialType(CreateBoardSignatoryDto) {}
