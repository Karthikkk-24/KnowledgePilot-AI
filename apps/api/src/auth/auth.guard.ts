import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { loadEnv } from '@knowledgepilot/config';
import { AuthService } from './auth.service';
import {
  AUTH_HEADER_TENANT,
  AUTH_HEADER_USER,
  type AuthPrincipal,
} from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';

export type AuthedRequest = Request & {
  auth?: AuthPrincipal;
  requestId?: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly env = loadEnv();

  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const requestId = req.requestId || 'unknown';

    if (this.env.AUTH_PROVIDER === 'stub') {
      req.auth = await this.authService.resolveStubPrincipal({
        userIdHeader: header(req, AUTH_HEADER_USER),
        tenantIdHeader: header(req, AUTH_HEADER_TENANT),
        requestId,
      });
      return true;
    }

    if (this.env.AUTH_PROVIDER === 'clerk') {
      req.auth = await this.authService.resolveClerkPrincipal({
        authorization: header(req, 'authorization'),
        tenantIdHeader: header(req, AUTH_HEADER_TENANT),
        requestId,
      });
      return true;
    }

    throw new UnauthorizedException('Unsupported AUTH_PROVIDER');
  }
}

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}
