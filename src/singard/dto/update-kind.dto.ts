import { PartialType } from '@nestjs/mapped-types';
import { CreateSingardKindDto } from './create-kind.dto';

export class UpdateSingardKindDto extends PartialType(CreateSingardKindDto) {}
