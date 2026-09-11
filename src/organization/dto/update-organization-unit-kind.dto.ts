import { PartialType } from '@nestjs/mapped-types';
import { CreateOrganizationUnitKindDto } from './create-organization-unit-kind.dto';

export class UpdateOrganizationUnitKindDto extends PartialType(
  CreateOrganizationUnitKindDto,
) {}
