import { IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { UserStatus } from '../../generated/prisma/client';
import { CreateContractorPortalUserDto } from './create-contractor-portal-user.dto';
import { PartialType, OmitType } from '@nestjs/mapped-types';

export class UpdateContractorPortalUserDto extends PartialType(
  OmitType(CreateContractorPortalUserDto, ['password'] as const),
) {
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
