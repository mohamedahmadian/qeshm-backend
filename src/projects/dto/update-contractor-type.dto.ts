import { PartialType } from '@nestjs/mapped-types';
import { CreateContractorTypeDto } from './create-contractor-type.dto';

export class UpdateContractorTypeDto extends PartialType(CreateContractorTypeDto) {}
