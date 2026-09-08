import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtUserInterceptor implements NestInterceptor {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      return next.handle();
    }

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        act?: string;
        impersonating?: boolean;
      }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (user && user.status === UserStatus.ACTIVE) {
        request.user = { id: user.id };
        request.impersonating = payload.impersonating === true;
        request.impersonatedById =
          payload.impersonating === true && typeof payload.act === 'string'
            ? payload.act
            : null;
      }
    } catch {
      /* token optional — no guards in this template */
    }

    return next.handle();
  }
}
