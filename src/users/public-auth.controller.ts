import { Body, Controller, Post } from '@nestjs/common';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { UsersService } from './users.service';

@Controller('auth')
export class PublicAuthController {
  constructor(private readonly users: UsersService) {}

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.users.forgotPasswordByIdentifier(dto.identifier, dto.channel);
  }
}
