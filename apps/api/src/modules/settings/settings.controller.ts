import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@knowledgepilot/db';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { MinRole } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ok } from '../../common/http';
import { SettingsService, type TenantSettingsDto } from './settings.service';

@Controller('settings')
@UseGuards(AuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async get(
    @CurrentAuth() auth: AuthPrincipal,
  ): Promise<ReturnType<typeof ok<TenantSettingsDto>>> {
    return ok(await this.settingsService.getTenantSettings(auth.tenantId, auth.userId));
  }

  @Get('me')
  async me(
    @CurrentAuth() auth: AuthPrincipal,
  ): Promise<
    ReturnType<
      typeof ok<{
        userId: string;
        tenantId: string;
        role: string;
        email?: string | null;
        name?: string | null;
      }>
    >
  > {
    return ok({
      userId: auth.userId,
      tenantId: auth.tenantId,
      role: auth.role,
      email: auth.email,
      name: auth.name,
    });
  }

  @Patch('tenant')
  @MinRole(MembershipRole.admin)
  async updateTenant(
    @CurrentAuth() auth: AuthPrincipal,
    @Body() body: { name?: string },
  ): Promise<ReturnType<typeof ok<{ id: string; name: string; slug: string; createdAt: string }>>> {
    return ok(await this.settingsService.updateTenantName(auth.tenantId, body?.name ?? ''));
  }
}
