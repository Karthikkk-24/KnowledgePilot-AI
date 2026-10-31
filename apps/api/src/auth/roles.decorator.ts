import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@knowledgepilot/db';

export const MIN_ROLE_KEY = 'minRole';
export const MinRole = (role: MembershipRole) => SetMetadata(MIN_ROLE_KEY, role);
