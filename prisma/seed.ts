import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { ensureSystemRoles, ADMIN_ROLE_CODE } from '../src/access/access.constants';
import { geoSeed } from './geo-data';
import { importProjects } from './import-projects';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function seedGeo() {
  for (const country of geoSeed) {
    const record = await prisma.country.upsert({
      where: { iso2: country.iso2 },
      update: {
        iso3: country.iso3,
        phoneCode: country.phoneCode,
        nameFa: country.nameFa,
        nameEn: country.nameEn,
        sortOrder: country.sortOrder,
        isActive: true,
      },
      create: {
        iso2: country.iso2,
        iso3: country.iso3,
        phoneCode: country.phoneCode,
        nameFa: country.nameFa,
        nameEn: country.nameEn,
        sortOrder: country.sortOrder,
        isActive: true,
      },
    });

    for (const [provinceIndex, province] of country.provinces.entries()) {
      const provinceRecord = await prisma.province.upsert({
        where: {
          countryId_code: { countryId: record.id, code: province.code },
        },
        update: {
          nameFa: province.nameFa,
          nameEn: province.nameEn,
          sortOrder: provinceIndex + 1,
          isActive: true,
        },
        create: {
          countryId: record.id,
          code: province.code,
          nameFa: province.nameFa,
          nameEn: province.nameEn,
          sortOrder: provinceIndex + 1,
          isActive: true,
        },
      });

      for (const [cityIndex, city] of province.cities.entries()) {
        await prisma.city.upsert({
          where: {
            provinceId_code: {
              provinceId: provinceRecord.id,
              code: city.code,
            },
          },
          update: {
            nameFa: city.nameFa,
            nameEn: city.nameEn,
            sortOrder: cityIndex + 1,
            isActive: true,
          },
          create: {
            provinceId: provinceRecord.id,
            code: city.code,
            nameFa: city.nameFa,
            nameEn: city.nameEn,
            sortOrder: cityIndex + 1,
            isActive: true,
          },
        });
      }
    }
  }
}

const SYSTEM_POSITIONS = [
  { code: 'DEPUTY', name: 'معاون' },
  { code: 'MANAGER', name: 'مدیر' },
  { code: 'HEAD', name: 'رئیس' },
  { code: 'SUPERVISOR', name: 'سرپرست' },
  { code: 'SECRETARY', name: 'دبیر' },
  { code: 'EXPERT', name: 'کارشناس' },
] as const;

async function seedPositions() {
  for (const item of SYSTEM_POSITIONS) {
    const existing = await prisma.organizationPosition.findFirst({
      where: { OR: [{ code: item.code }, { name: item.name }] },
    });
    if (existing) {
      await prisma.organizationPosition.update({
        where: { id: existing.id },
        data: { code: item.code, name: item.name, isSystem: true },
      });
      continue;
    }
    await prisma.organizationPosition.create({
      data: { code: item.code, name: item.name, isSystem: true },
    });
  }
}

async function main() {
  await seedGeo();
  await seedPositions();
  const passwordHash = await bcrypt.hash('Admin1234', 10);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash,
      firstName: 'مدیر',
      lastName: 'سامانه',
      fullName: 'مدیر سامانه',
      status: 'ACTIVE',
    },
    create: {
      username: 'admin',
      passwordHash,
      firstName: 'مدیر',
      lastName: 'سامانه',
      fullName: 'مدیر سامانه',
      locale: 'fa',
      status: 'ACTIVE',
    },
  });
  await ensureSystemRoles(prisma, true);
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: ADMIN_ROLE_CODE },
  });
  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: adminUser.id, roleId: adminRole.id },
    },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });
  await importProjects(prisma);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
