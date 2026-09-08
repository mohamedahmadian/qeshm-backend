import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsString()
  @MinLength(8)
  password?: string;
}
