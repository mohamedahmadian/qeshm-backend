import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TAAVONI_BELIT_ROLE_CODE } from '../access/access.constants';
import { UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  COOPERATIVE_TOKEN_SCOPE,
  PORT_SECURITY_HEADER,
} from './cooperative.constants';

type CooperativeRequest = {
  headers: Record<string, string | string[] | undefined>;
  cooperative?: { userId: string; portId: string };
};

@Injectable()
export class CooperativeAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CooperativeRequest>();
    const header = request.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    const token = raw?.startsWith('Bearer ') ? raw.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException('توکن ورود لازم است');
    }

    let payload: { sub?: string; scope?: string; portId?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('توکن ورود منقضی یا نامعتبر است');
    }
    if (
      payload.scope !== COOPERATIVE_TOKEN_SCOPE ||
      !payload.sub ||
      !payload.portId
    ) {
      throw new UnauthorizedException('توکن ورود منقضی یا نامعتبر است');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        status: true,
        userRoles: { select: { role: { select: { code: true } } } },
        operatedPort: { select: { id: true, securityToken: true } },
      },
    });
    const isCooperative = user?.userRoles.some(
      (item) => item.role.code === TAAVONI_BELIT_ROLE_CODE,
    );
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !isCooperative ||
      user.operatedPort?.id !== payload.portId
    ) {
      throw new UnauthorizedException('توکن ورود منقضی یا نامعتبر است');
    }

    const presented = headerValue(request.headers[PORT_SECURITY_HEADER]);
    if (!presented) {
      throw new UnauthorizedException('توکن امنیتی بندر لازم است');
    }
    if (!tokensMatch(presented, user.operatedPort.securityToken)) {
      throw new UnauthorizedException('توکن امنیتی بندر نادرست است');
    }

    request.cooperative = { userId: user.id, portId: user.operatedPort.id };
    return true;
  }
}

function headerValue(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? '';
}

function tokensMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
