import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createDbClient } from '@knowledgepilot/db';

export type TenantSettingsDto = {
  tenant: { id: string; name: string; slug: string; createdAt: string };
  role: string | null;
  members: Array<{
    userId: string;
    email: string | null;
    name: string | null;
    role: string;
    createdAt: string;
  }>;
};

@Injectable()
export class SettingsService {
  private readonly db = createDbClient();

  async getTenantSettings(tenantId: string, userId: string): Promise<TenantSettingsDto> {
    const tenant = await this.db.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const memberships = await this.db.membership.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const me = memberships.find((m) => m.userId === userId);

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        createdAt: tenant.createdAt.toISOString(),
      },
      role: me?.role ?? null,
      members: memberships.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async updateTenantName(
    tenantId: string,
    name: string,
  ): Promise<{ id: string; name: string; slug: string; createdAt: string }> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Name is required');
    }
    const tenant = await this.db.tenant.update({
      where: { id: tenantId },
      data: { name: trimmed },
    });
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt.toISOString(),
    };
  }
}
