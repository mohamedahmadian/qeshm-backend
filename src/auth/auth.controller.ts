import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { APP_LOCALES } from '../users/dto/create-user.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Impersonation } from './decorators/impersonation.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { LoginDto } from './dto/login.dto';

class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsIn([...APP_LOCALES])
  locale?: string;
}

type RequestUser = { id: string };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('impersonate')
  impersonate(
    @CurrentUser() actor: RequestUser | undefined,
    @Impersonation() impersonation: { impersonating: boolean },
    @Body() dto: ImpersonateDto,
  ) {
    if (!actor?.id) {
      throw new UnauthorizedException();
    }
    return this.auth.impersonate(
      actor.id,
      dto.userId,
      impersonation.impersonating,
    );
  }

  @Get('me')
  me(
    @CurrentUser() user: RequestUser | undefined,
    @Impersonation() impersonation: { actorId: string | null },
  ) {
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return this.auth.profile(user.id, impersonation.actorId);
  }

  @Patch('password')
  changePassword(
    @CurrentUser() user: RequestUser | undefined,
    @Impersonation() impersonation: { impersonating: boolean },
    @Body() dto: ChangePasswordDto,
  ) {
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return this.auth.changePassword(user.id, dto, impersonation.impersonating);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: RequestUser | undefined,
    @Impersonation() impersonation: { impersonating: boolean },
    @Body() dto: UpdateSettingsDto,
  ) {
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return this.auth.updateSettings(
      user.id,
      dto.fullName,
      dto.locale,
      impersonation.impersonating,
    );
  }
}
