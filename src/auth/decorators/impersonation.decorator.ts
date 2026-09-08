import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Impersonation = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return {
      impersonating: Boolean(request.impersonating),
      actorId: (request.impersonatedById as string | null) ?? null,
    };
  },
);
