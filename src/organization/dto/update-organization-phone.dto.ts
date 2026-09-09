import { PartialType } from '@nestjs/mapped-types';
import { CreateOrganizationPhoneDto } from './create-organization-phone.dto';

export class UpdateOrganizationPhoneDto extends PartialType(
  CreateOrganizationPhoneDto,
) {}
