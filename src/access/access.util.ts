import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_ROLE_CODE } from './access.constants';
import { parentPermissionCode } from './permissions-catalog';

export type UserAccess = {
  isAdmin: boolean;
  roleCodes: string[];
  permissionCodes: string[];
};

export async function loadUserAccess(
  prisma: PrismaService,
  userId: string,
): Promise<UserAccess> {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          code: true,
          permissions: { select: { code: true } },
        },
      },
    },
  });
  const roleCodes = rows.map((row) => row.role.code);
  const isAdmin = roleCodes.includes(ADMIN_ROLE_CODE);
  const permissionCodes = isAdmin
    ? []
    : [
        ...new Set(
          rows.flatMap((row) => row.role.permissions.map((item) => item.code)),
        ),
      ];
  return { isAdmin, roleCodes, permissionCodes };
}

export function hasPermission(
  access: Pick<UserAccess, 'isAdmin' | 'permissionCodes'>,
  code: string,
) {
  if (access.isAdmin) return true;
  if (access.permissionCodes.includes(code)) return true;
  const parent = parentPermissionCode(code);
  return parent ? access.permissionCodes.includes(parent) : false;
}

export function hasAnyPermission(
  access: Pick<UserAccess, 'isAdmin' | 'permissionCodes'>,
  codes: string[],
) {
  return codes.some((code) => hasPermission(access, code));
}
