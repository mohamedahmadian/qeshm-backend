import { PartialType } from '@nestjs/mapped-types';
import { CreateOrganizationPositionDto } from './create-organization-position.dto';

export class UpdateOrganizationPositionDto extends PartialType(
  CreateOrganizationPositionDto,
) {}
