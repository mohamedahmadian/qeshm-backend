import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
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

async function main() {
  await seedGeo();
  const passwordHash = await bcrypt.hash('Admin1234', 10);
  await prisma.user.upsert({
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
