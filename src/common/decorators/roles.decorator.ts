import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client.js';

export const ROLES_KEY = 'roles';

// Only signed-in users with one of these roles may call the route (checked by RolesGuard).
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// The seller's own people: the owner and managers.
export const STAFF_ROLES: Role[] = ['OWNER', 'MANAGER'];
