import { PartialType } from '@nestjs/mapped-types';
import { CreateContractorMemberDto } from './create-contractor-member.dto';

export class UpdateContractorMemberDto extends PartialType(
  CreateContractorMemberDto,
) {}
