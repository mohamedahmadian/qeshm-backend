import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TAAVONI_BELIT_ROLE_CODE } from '../access/access.constants';
import { UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  COOPERATIVE_TOKEN_SCOPE,
  COOPERATIVE_TOKEN_TTL,
  COOPERATIVE_TOKEN_TTL_SECONDS,
} from './cooperative.constants';
import { CooperativeLoginDto } from './dto/cooperative-login.dto';

@Injectable()
export class CooperativeAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: CooperativeLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        userRoles: { select: { role: { select: { code: true } } } },
        operatedPort: {
          select: { id: true, name: true, cooperativeName: true },
        },
      },
    });
    const passwordOk =
      user != null && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || user.status !== UserStatus.ACTIVE || !passwordOk) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است');
    }

    const isCooperative = user.userRoles.some(
      (item) => item.role.code === TAAVONI_BELIT_ROLE_CODE,
    );
    if (!isCooperative) {
      throw new ForbiddenException('فقط کاربر تعاونی بلیت می‌تواند توکن این سرویس را بگیرد');
    }
    if (!user.operatedPort) {
      throw new ForbiddenException('این کاربر به بندری وصل نیست');
    }

    const token = await this.jwt.signAsync(
      {
        sub: user.id,
        scope: COOPERATIVE_TOKEN_SCOPE,
        portId: user.operatedPort.id,
      },
      { expiresIn: COOPERATIVE_TOKEN_TTL },
    );

    return {
      tokenType: 'Bearer' as const,
      token,
      expiresIn: COOPERATIVE_TOKEN_TTL_SECONDS,
      port: user.operatedPort,
    };
  }
}
