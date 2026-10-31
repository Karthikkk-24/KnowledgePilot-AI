import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { loadEnv } from '@knowledgepilot/config';
import {
  createDbClient,
  ensureStubUser,
  MembershipRole,
  STUB_TENANT_ID,
  STUB_USER_ID,
} from '@knowledgepilot/db';
import type { AuthPrincipal } from './auth.types';

@Injectable()
export class AuthService {
  private readonly db = createDbClient();
  private readonly env = loadEnv();
  private readonly clerk =
    this.env.AUTH_PROVIDER === 'clerk'
      ? createClerkClient({ secretKey: this.env.CLERK_SECRET_KEY })
      : null;

  async resolveStubPrincipal(input: {
    userIdHeader?: string;
    tenantIdHeader?: string;
    requestId: string;
  }): Promise<AuthPrincipal> {
    await ensureStubUser(this.db);
    const userId = input.userIdHeader?.trim() || STUB_USER_ID;
    const user = await this.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { memberships: { orderBy: { createdAt: 'asc' } } },
    });
    if (!user) {
      throw new UnauthorizedException('Unknown stub user');
    }

    const tenantId = await this.pickTenantId(user.memberships, input.tenantIdHeader);
    const membership = user.memberships.find((m) => m.tenantId === tenantId);
    if (!membership) {
      throw new ForbiddenException('No membership for tenant');
    }

    return {
      userId: user.id,
      tenantId,
      role: membership.role,
      email: user.email,
      name: user.name,
      requestId: input.requestId,
    };
  }

  async resolveClerkPrincipal(input: {
    authorization?: string;
    tenantIdHeader?: string;
    requestId: string;
  }): Promise<AuthPrincipal> {
    const token = input.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    let clerkUserId: string;
    try {
      const payload = await verifyToken(token, {
        secretKey: this.env.CLERK_SECRET_KEY,
        jwtKey: this.env.CLERK_JWT_KEY || undefined,
      });
      if (!payload.sub) {
        throw new UnauthorizedException('Invalid Clerk token');
      }
      clerkUserId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid Clerk token');
    }

    let user = await this.db.user.findFirst({
      where: { clerkUserId, deletedAt: null },
      include: { memberships: { orderBy: { createdAt: 'asc' } } },
    });

    if (!user) {
      const clerkUser = this.clerk
        ? await this.clerk.users.getUser(clerkUserId).catch(() => null)
        : null;
      const email =
        clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
          ?.emailAddress ??
        clerkUser?.emailAddresses[0]?.emailAddress ??
        null;
      const name =
        [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') ||
        clerkUser?.username ||
        null;

      user = await this.db.user.create({
        data: {
          clerkUserId,
          email,
          name,
          memberships: {
            create: {
              tenantId: STUB_TENANT_ID,
              role: MembershipRole.member,
            },
          },
        },
        include: { memberships: { orderBy: { createdAt: 'asc' } } },
      });
    }

    if (user.memberships.length === 0) {
      await this.db.membership.create({
        data: {
          tenantId: STUB_TENANT_ID,
          userId: user.id,
          role: MembershipRole.member,
        },
      });
      user = await this.db.user.findFirstOrThrow({
        where: { id: user.id },
        include: { memberships: { orderBy: { createdAt: 'asc' } } },
      });
    }

    const tenantId = await this.pickTenantId(user.memberships, input.tenantIdHeader);
    const membership = user.memberships.find((m) => m.tenantId === tenantId);
    if (!membership) {
      throw new ForbiddenException('No membership for tenant');
    }

    return {
      userId: user.id,
      tenantId,
      role: membership.role,
      email: user.email,
      name: user.name,
      requestId: input.requestId,
    };
  }

  assertMinRole(principal: AuthPrincipal, min: MembershipRole) {
    const rank: Record<MembershipRole, number> = {
      viewer: 1,
      member: 2,
      admin: 3,
      owner: 4,
    };
    if (rank[principal.role] < rank[min]) {
      throw new ForbiddenException(`Requires role ${min} or higher`);
    }
  }

  private async pickTenantId(
    memberships: Array<{ tenantId: string }>,
    tenantIdHeader?: string,
  ): Promise<string> {
    if (!memberships.length) {
      throw new ForbiddenException('User has no tenant memberships');
    }
    if (tenantIdHeader) {
      if (!memberships.some((m) => m.tenantId === tenantIdHeader)) {
        throw new ForbiddenException('Not a member of requested tenant');
      }
      return tenantIdHeader;
    }
    return memberships[0]!.tenantId;
  }
}
