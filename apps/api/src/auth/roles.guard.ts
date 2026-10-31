import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@knowledgepilot/db';
import { AuthService } from './auth.service';
import type { AuthedRequest } from './auth.guard';
import { MIN_ROLE_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const minRole = this.reflector.getAllAndOverride<MembershipRole | undefined>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!minRole) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) return false;
    this.authService.assertMinRole(req.auth, minRole);
    return true;
  }
}
