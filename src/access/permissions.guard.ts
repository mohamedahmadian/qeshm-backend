import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CONTRACTOR_ROLE_CODE } from './access.constants';
import { hasAnyPermission } from './access.util';
import { isSingardApiPath, resolveAccessDecision } from './route-permissions';

type RequestAccessUser = {
  id?: string;
  isAdmin?: boolean;
  roleCodes?: string[];
  permissionCodes?: string[];
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url?: string;
      query?: Record<string, unknown>;
      user?: RequestAccessUser;
    }>();
    const decision = resolveAccessDecision(
      request.method,
      request.originalUrl ?? request.url ?? '/',
      request.query ?? {},
    );

    if (decision.kind === 'public') {
      return true;
    }

    const user = request.user;
    if (!user?.id) {
      throw new UnauthorizedException();
    }

    if (
      !user.isAdmin &&
      user.roleCodes?.includes(CONTRACTOR_ROLE_CODE) &&
      isSingardApiPath(request.originalUrl ?? request.url ?? '/')
    ) {
      throw new ForbiddenException('دسترسی مجاز نیست');
    }

    if (decision.kind === 'auth' || user.isAdmin) {
      return true;
    }

    if (
      hasAnyPermission(
        {
          isAdmin: Boolean(user.isAdmin),
          permissionCodes: user.permissionCodes ?? [],
        },
        decision.permissions,
      )
    ) {
      return true;
    }

    throw new ForbiddenException('دسترسی مجاز نیست');
  }
}
