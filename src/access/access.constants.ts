import { PrismaClient } from '../generated/prisma/client';

export const ADMIN_ROLE_CODE = 'ADMIN';
export const EMPLOYEE_ROLE_CODE = 'EMPLOYEE';
export const CITIZEN_ROLE_CODE = 'CITIZEN';
export const BOARD_ADMIN_ROLE_CODE = 'BOARD_ADMIN';

export const BOARD_ADMIN_PERMISSION_CODES = [
  'board',
  'board.requests',
  'board.plans',
  'board.minutes',
  'board.permissions',
] as const;

export const SYSTEM_ROLES = [
  {
    code: ADMIN_ROLE_CODE,
    name: 'مدیریت',
    description: 'دسترسی کامل به همه منوها و بخش‌های سامانه',
  },
  {
    code: EMPLOYEE_ROLE_CODE,
    name: 'کارمند',
    description: 'نقش پیش‌فرض کارکنان سامانه',
  },
  {
    code: CITIZEN_ROLE_CODE,
    name: 'شهروند و گردشگر',
    description: 'ثبت نظر در سینگارد و پیگیری نظرهای خود',
  },
  {
    code: BOARD_ADMIN_ROLE_CODE,
    name: 'مدیر ماژول هیئت مدیره',
    description: 'مدیریت ماژول هیئت مدیره، صورت‌جلسه‌ها و انتخاب واحد و سمت هنگام ثبت درخواست',
  },
] as const;

export const RESERVED_ROLE_CODES = new Set<string>(
  SYSTEM_ROLES.map((role) => role.code),
);

export function isReservedRoleCode(code: string) {
  return RESERVED_ROLE_CODES.has(code);
}

export function isRolePermissionsLocked(code: string) {
  return code === ADMIN_ROLE_CODE || code === CITIZEN_ROLE_CODE;
}

export async function ensureSystemRoles(
  prisma: PrismaClient,
  overwriteNames = false,
) {
  for (const role of SYSTEM_ROLES) {
    const saved = await prisma.role.upsert({
      where: { code: role.code },
      update: overwriteNames
        ? {
            name: role.name,
            description: role.description,
            isSystem: true,
          }
        : { isSystem: true },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: true,
      },
    });
    if (saved.code === BOARD_ADMIN_ROLE_CODE) {
      await prisma.rolePermission.createMany({
        data: BOARD_ADMIN_PERMISSION_CODES.map((code) => ({
          roleId: saved.id,
          code,
        })),
        skipDuplicates: true,
      });
    }
  }
}

export async function ensureEmployeeRole(prisma: PrismaClient) {
  const employee = SYSTEM_ROLES.find((role) => role.code === EMPLOYEE_ROLE_CODE)!;
  return prisma.role.upsert({
    where: { code: employee.code },
    update: { isSystem: true },
    create: {
      code: employee.code,
      name: employee.name,
      description: employee.description,
      isSystem: true,
    },
    select: { id: true },
  });
}
