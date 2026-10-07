import { Body, Controller, Post } from '@nestjs/common';
import { CooperativeAuthService } from './cooperative-auth.service';
import { CooperativeLoginDto } from './dto/cooperative-login.dto';

@Controller('cooperative/auth')
export class CooperativeAuthController {
  constructor(private readonly auth: CooperativeAuthService) {}

  @Post('token')
  token(@Body() dto: CooperativeLoginDto) {
    return this.auth.login(dto);
  }
}
