import { Body, Controller, Post, UseFilters } from '@nestjs/common';
import { CooperativeAuthService } from './cooperative-auth.service';
import { CooperativeExceptionFilter } from './cooperative-response';
import { CooperativeLoginDto } from './dto/cooperative-login.dto';

@Controller('cooperative/auth')
@UseFilters(CooperativeExceptionFilter)
export class CooperativeAuthController {
  constructor(private readonly auth: CooperativeAuthService) {}

  @Post('token')
  token(@Body() dto: CooperativeLoginDto) {
    return this.auth.login(dto);
  }
}
