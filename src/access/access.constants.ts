import { PrismaClient } from '../generated/prisma/client';

export const ADMIN_ROLE_CODE = 'ADMIN';
export const EMPLOYEE_ROLE_CODE = 'EMPLOYEE';
export const CITIZEN_ROLE_CODE = 'CITIZEN';
export const BOARD_ADMIN_ROLE_CODE = 'BOARD_ADMIN';
export const CONTRACTOR_ROLE_CODE = 'CONTRACTOR';
export const STAKEHOLDERS_ADMIN_ROLE_CODE = 'STAKEHOLDERS_ADMIN';
export const TAAVONI_BELIT_ROLE_CODE = 'TAAVONI_BELIT';

export const TAAVONI_BELIT_PERMISSION_CODES = [
  'stakeholders.port-sales-reports',
] as const;

export const CONTRACTOR_PERMISSION_CODES = [
  'stakeholders.projects',
  'stakeholders.progress',
  'stakeholders.correspondence',
  'stakeholders.port-sales-reports',
  'stakeholders.my-subsidies',
] as const;

/** ثبت نظر و پیگیری نظرهای خود؛ بقیهٔ منوهای سینگارد فقط از مدیریت نقش‌ها. */
export const SINGARD_SELF_PERMISSION_CODES = [
  'singard.submit',
  'singard.mine',
] as const;

export const EMPLOYEE_PERMISSION_CODES = [
  'food-reservation.reserve',
  'food-reservation.my-orders',
  'food-reservation.my-report',
  ...SINGARD_SELF_PERMISSION_CODES,
] as const;

export const CITIZEN_PERMISSION_CODES = [...SINGARD_SELF_PERMISSION_CODES] as const;

export const BOARD_ADMIN_PERMISSION_CODES = [
  'board',
  'board.search',
  'board.minutes',
  'board.resolutions',
  'board.reports',
  'board.calendar',
  'board.requests',
  'board.plans',
  'board.permissions',
] as const;

export const STAKEHOLDERS_ADMIN_PERMISSION_CODES = [
  'stakeholders',
  'stakeholders.projects',
  'stakeholders.progress',
  'stakeholders.correspondence',
  'stakeholders.inbox',
  'stakeholders.reports',
  'stakeholders.port-sales-reports',
  'stakeholders.my-subsidies',
  'stakeholders.ticket-tariffs',
  'stakeholders.ports',
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
  {
    code: CONTRACTOR_ROLE_CODE,
    name: 'پیمانکار',
    description: 'دسترسی به درگاه یکپارچه ذی‌نفعان و پروژه‌های تخصیص‌یافته',
  },
  {
    code: STAKEHOLDERS_ADMIN_ROLE_CODE,
    name: 'مدیر ماژول درگاه یکپارچه',
    description: 'مدیریت درگاه یکپارچه ذی‌نفعان و مشاهدهٔ همهٔ گزارش‌های فروش بنادر',
  },
  {
    code: TAAVONI_BELIT_ROLE_CODE,
    name: 'تعاونی بلیت',
    description: 'کاربر تعاونی فروش بلیت که به یک بندر اختصاص داده می‌شود',
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
    const existing = await prisma.role.findUnique({
      where: { code: role.code },
      select: { id: true },
    });
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
      await grantRolePermissions(prisma, saved.id, BOARD_ADMIN_PERMISSION_CODES);
    }
    if (saved.code === STAKEHOLDERS_ADMIN_ROLE_CODE) {
      await grantRolePermissions(prisma, saved.id, STAKEHOLDERS_ADMIN_PERMISSION_CODES);
    }
    if (saved.code === EMPLOYEE_ROLE_CODE) {
      await grantRolePermissions(prisma, saved.id, EMPLOYEE_PERMISSION_CODES);
    }
    if (saved.code === CITIZEN_ROLE_CODE) {
      await grantRolePermissions(prisma, saved.id, CITIZEN_PERMISSION_CODES);
    }
    if (saved.code === CONTRACTOR_ROLE_CODE) {
      await grantRolePermissions(prisma, saved.id, ['stakeholders.my-subsidies']);
    }
    if (saved.code === TAAVONI_BELIT_ROLE_CODE) {
      await grantRolePermissions(prisma, saved.id, TAAVONI_BELIT_PERMISSION_CODES);
    }
    if (saved.code === CONTRACTOR_ROLE_CODE && !existing) {
      await prisma.rolePermission.createMany({
        data: CONTRACTOR_PERMISSION_CODES.map((code) => ({
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
  const saved = await prisma.role.upsert({
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
  await grantRolePermissions(prisma, saved.id, EMPLOYEE_PERMISSION_CODES);
  return saved;
}

async function grantRolePermissions(
  prisma: PrismaClient,
  roleId: string,
  codes: readonly string[],
) {
  await prisma.rolePermission.createMany({
    data: codes.map((code) => ({ roleId, code })),
    skipDuplicates: true,
  });
}

export async function ensureCitizenRole(prisma: PrismaClient) {
  const citizen = SYSTEM_ROLES.find((role) => role.code === CITIZEN_ROLE_CODE)!;
  const saved = await prisma.role.upsert({
    where: { code: citizen.code },
    update: { isSystem: true },
    create: {
      code: citizen.code,
      name: citizen.name,
      description: citizen.description,
      isSystem: true,
    },
    select: { id: true },
  });
  await grantRolePermissions(prisma, saved.id, CITIZEN_PERMISSION_CODES);
  return saved;
}
