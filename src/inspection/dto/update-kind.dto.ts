import { PartialType } from '@nestjs/mapped-types';
import { CreateInspectionKindDto } from './create-kind.dto';

export class UpdateInspectionKindDto extends PartialType(CreateInspectionKindDto) {}
