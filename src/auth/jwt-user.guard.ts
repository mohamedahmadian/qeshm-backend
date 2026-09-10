import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { loadUserAccess } from '../access/access.util';
import { UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtUserGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      return true;
    }

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        act?: string;
        impersonating?: boolean;
      }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true },
      });
      if (user && user.status === UserStatus.ACTIVE) {
        const access = await loadUserAccess(this.prisma, user.id);
        request.user = {
          id: user.id,
          isAdmin: access.isAdmin,
          roleCodes: access.roleCodes,
          permissionCodes: access.permissionCodes,
        };
        request.impersonating = payload.impersonating === true;
        request.impersonatedById =
          payload.impersonating === true && typeof payload.act === 'string'
            ? payload.act
            : null;
      }
    } catch {
      /* invalid token — treated as anonymous */
    }

    return true;
  }
}
