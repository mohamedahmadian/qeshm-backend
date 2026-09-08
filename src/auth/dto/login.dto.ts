import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { APP_LOCALES } from '../../users/dto/create-user.dto';

export class LoginDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsIn([...APP_LOCALES])
  locale?: string;
}
