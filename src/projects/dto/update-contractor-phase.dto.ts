import { PartialType } from '@nestjs/mapped-types';
import { CreateContractorPhaseDto } from './create-contractor-phase.dto';

export class UpdateContractorPhaseDto extends PartialType(
  CreateContractorPhaseDto,
) {}
