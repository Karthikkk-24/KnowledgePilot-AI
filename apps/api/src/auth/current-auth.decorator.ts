import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthedRequest } from './auth.guard';
import type { AuthPrincipal } from './auth.types';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) {
      throw new UnauthorizedException('Not authenticated');
    }
    return req.auth;
  },
);
