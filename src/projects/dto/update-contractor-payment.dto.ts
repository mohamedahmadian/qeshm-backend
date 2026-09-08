import { PartialType } from '@nestjs/mapped-types';
import { CreateContractorPaymentDto } from './create-contractor-payment.dto';

export class UpdateContractorPaymentDto extends PartialType(
  CreateContractorPaymentDto,
) {}
