import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
import { normalizeMobile } from '../../common/phone';

const usernamePattern = /^[A-Za-z0-9._-]{3,}$/;

export class CreateContractorPortalUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  firstName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  lastName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(usernamePattern, { message: 'نام کاربری فقط با حروف انگلیسی، عدد و . _ - است' })
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @Transform(({ value }) => {
    const empty = emptyToNull(value);
    if (typeof empty !== 'string') return empty;
    const phone = normalizeMobile(empty);
    return phone || null;
  })
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'تلفن همراه معتبر نیست' })
  phone?: string | null;
}
