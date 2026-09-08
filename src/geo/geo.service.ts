import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { CreateProvinceDto } from './dto/create-province.dto';
import { FindGeoQueryDto } from './dto/find-geo-query.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { UpdateProvinceDto } from './dto/update-province.dto';

const countrySelect = {
  id: true,
  iso2: true,
  iso3: true,
  phoneCode: true,
  nameFa: true,
  nameEn: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { provinces: true } },
} satisfies Prisma.CountrySelect;

const provinceSelect = {
  id: true,
  countryId: true,
  code: true,
  nameFa: true,
  nameEn: true,
  neshanAddress: true,
  latitude: true,
  longitude: true,
  hasRailway: true,
  hasAirport: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  country: {
    select: { id: true, iso2: true, nameFa: true, nameEn: true, isActive: true },
  },
  _count: { select: { cities: true } },
} satisfies Prisma.ProvinceSelect;

const citySelect = {
  id: true,
  provinceId: true,
  code: true,
  nameFa: true,
  nameEn: true,
  neshanAddress: true,
  latitude: true,
  longitude: true,
  isProvinceCapital: true,
  hasRailway: true,
  hasAirport: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  province: {
    select: {
      id: true,
      code: true,
      nameFa: true,
      nameEn: true,
      isActive: true,
      countryId: true,
      country: {
        select: {
          id: true,
          iso2: true,
          nameFa: true,
          nameEn: true,
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.CitySelect;

function nameFilter(q: string): Prisma.StringFilter {
  return { contains: q, mode: 'insensitive' };
}

function toDecimal(value?: number | null) {
  if (value === undefined) {
    return undefined;
  }
  return value == null ? null : new Prisma.Decimal(value);
}

function toCoord(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value);
}

function withCoords<
  T extends { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null },
>(item: T) {
  return {
    ...item,
    latitude: toCoord(item.latitude),
    longitude: toCoord(item.longitude),
  };
}

function withCoordsList<
  T extends { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null },
>(items: T[]) {
  return items.map(withCoords);
}

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  async findCountries(query: FindGeoQueryDto) {
    const where: Prisma.CountryWhereInput = {
      isActive: query.activeOnly ? true : undefined,
      OR: query.q
        ? [
            { nameFa: nameFilter(query.q) },
            { nameEn: nameFilter(query.q) },
            { iso2: { contains: query.q, mode: 'insensitive' } },
            { iso3: { contains: query.q, mode: 'insensitive' } },
            { phoneCode: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = this.countryOrderBy(query);
    if (!wantsPagination(query)) {
      return this.prisma.country.findMany({
        where,
        orderBy,
        select: countrySelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.country.findMany({
        where,
        orderBy,
        skip,
        take,
        select: countrySelect,
      }),
      this.prisma.country.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  private countryOrderBy(
    query: FindGeoQueryDto,
  ): Prisma.CountryOrderByWithRelationInput[] {
    return resolveSortOrder<Prisma.CountryOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        nameFa: (dir) => ({ nameFa: dir }),
        iso2: (dir) => ({ iso2: dir }),
        phoneCode: (dir) => ({ phoneCode: dir }),
        isActive: (dir) => ({ isActive: dir }),
        provinceCount: (dir) => ({ provinces: { _count: dir } }),
      },
      [{ sortOrder: 'asc' }, { nameFa: 'asc' }, { id: 'asc' }],
    );
  }

  async findCountry(id: string) {
    const country = await this.prisma.country.findUnique({
      where: { id },
      select: countrySelect,
    });
    if (!country) {
      throw new NotFoundException('کشور یافت نشد');
    }
    return country;
  }

  async createCountry(dto: CreateCountryDto) {
    try {
      return await this.prisma.country.create({
        data: this.countryData(dto),
        select: countrySelect,
      });
    } catch (error) {
      this.rethrowUnique(error, 'کد کشور تکراری است');
    }
  }

  async updateCountry(id: string, dto: UpdateCountryDto) {
    await this.findCountry(id);
    try {
      return await this.prisma.country.update({
        where: { id },
        data: this.countryData(dto),
        select: countrySelect,
      });
    } catch (error) {
      this.rethrowUnique(error, 'کد کشور تکراری است');
    }
  }

  async removeCountry(id: string) {
    await this.findCountry(id);
    const provinces = await this.prisma.province.count({
      where: { countryId: id },
    });
    if (provinces > 0) {
      throw new ConflictException('ابتدا استان‌های این کشور را حذف کنید');
    }
    await this.prisma.country.delete({ where: { id } });
    return { ok: true };
  }

  async findProvinces(query: FindGeoQueryDto) {
    const where: Prisma.ProvinceWhereInput = {
      countryId: query.countryId,
      isActive: query.activeOnly ? true : undefined,
      OR: query.q
        ? [
            { nameFa: nameFilter(query.q) },
            { nameEn: nameFilter(query.q) },
            { code: { contains: query.q, mode: 'insensitive' } },
            { neshanAddress: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = this.provinceOrderBy(query);
    if (!wantsPagination(query)) {
      return withCoordsList(
        await this.prisma.province.findMany({
          where,
          orderBy,
          select: provinceSelect,
        }),
      );
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.province.findMany({
        where,
        orderBy,
        skip,
        take,
        select: provinceSelect,
      }),
      this.prisma.province.count({ where }),
    ]);
    return paginatedResult(withCoordsList(items), total, page, pageSize);
  }

  private provinceOrderBy(
    query: FindGeoQueryDto,
  ): Prisma.ProvinceOrderByWithRelationInput[] {
    return resolveSortOrder<Prisma.ProvinceOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        nameFa: (dir) => ({ nameFa: dir }),
        code: (dir) => ({ code: dir }),
        hasRailway: (dir) => ({ hasRailway: dir }),
        hasAirport: (dir) => ({ hasAirport: dir }),
        isActive: (dir) => ({ isActive: dir }),
        country: (dir) => ({ country: { nameFa: dir } }),
        cityCount: (dir) => ({ cities: { _count: dir } }),
      },
      [{ sortOrder: 'asc' }, { nameFa: 'asc' }, { id: 'asc' }],
    );
  }

  async findProvince(id: string) {
    const province = await this.prisma.province.findUnique({
      where: { id },
      select: provinceSelect,
    });
    if (!province) {
      throw new NotFoundException('استان یافت نشد');
    }
    return withCoords(province);
  }

  async createProvince(dto: CreateProvinceDto) {
    await this.assertCountry(dto.countryId);
    try {
      return withCoords(
        await this.prisma.province.create({
          data: this.provinceData(dto),
          select: provinceSelect,
        }),
      );
    } catch (error) {
      this.rethrowUnique(error, 'کد استان در این کشور تکراری است');
    }
  }

  async updateProvince(id: string, dto: UpdateProvinceDto) {
    await this.findProvince(id);
    if (dto.countryId) {
      await this.assertCountry(dto.countryId);
    }
    try {
      return withCoords(
        await this.prisma.province.update({
          where: { id },
          data: this.provinceData(dto),
          select: provinceSelect,
        }),
      );
    } catch (error) {
      this.rethrowUnique(error, 'کد استان در این کشور تکراری است');
    }
  }

  async removeProvince(id: string) {
    await this.findProvince(id);
    const cities = await this.prisma.city.count({ where: { provinceId: id } });
    if (cities > 0) {
      throw new ConflictException('ابتدا شهرهای این استان را حذف کنید');
    }
    await this.prisma.province.delete({ where: { id } });
    return { ok: true };
  }

  async findCities(query: FindGeoQueryDto) {
    const where: Prisma.CityWhereInput = {
      provinceId: query.provinceId,
      province: query.countryId
        ? { countryId: query.countryId }
        : undefined,
      isActive: query.activeOnly ? true : undefined,
      OR: query.q
        ? [
            { nameFa: nameFilter(query.q) },
            { nameEn: nameFilter(query.q) },
            { code: { contains: query.q, mode: 'insensitive' } },
            { neshanAddress: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = this.cityOrderBy(query);
    if (!wantsPagination(query)) {
      return withCoordsList(
        await this.prisma.city.findMany({
          where,
          orderBy,
          select: citySelect,
        }),
      );
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.city.findMany({
        where,
        orderBy,
        skip,
        take,
        select: citySelect,
      }),
      this.prisma.city.count({ where }),
    ]);
    return paginatedResult(withCoordsList(items), total, page, pageSize);
  }

  private cityOrderBy(
    query: FindGeoQueryDto,
  ): Prisma.CityOrderByWithRelationInput[] {
    return resolveSortOrder<Prisma.CityOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        nameFa: (dir) => ({ nameFa: dir }),
        code: (dir) => ({ code: dir }),
        isProvinceCapital: (dir) => ({ isProvinceCapital: dir }),
        hasRailway: (dir) => ({ hasRailway: dir }),
        hasAirport: (dir) => ({ hasAirport: dir }),
        isActive: (dir) => ({ isActive: dir }),
        province: (dir) => ({ province: { nameFa: dir } }),
        country: (dir) => ({ province: { country: { nameFa: dir } } }),
      },
      [{ sortOrder: 'asc' }, { nameFa: 'asc' }, { id: 'asc' }],
    );
  }

  async findCity(id: string) {
    const city = await this.prisma.city.findUnique({
      where: { id },
      select: citySelect,
    });
    if (!city) {
      throw new NotFoundException('شهر یافت نشد');
    }
    return withCoords(city);
  }

  async createCity(dto: CreateCityDto) {
    await this.assertProvince(dto.provinceId);
    try {
      return withCoords(
        await this.prisma.$transaction(async (tx) => {
          if (dto.isProvinceCapital) {
            await this.clearOtherProvinceCapitals(tx, dto.provinceId);
          }
          return tx.city.create({
            data: this.cityData(dto),
            select: citySelect,
          });
        }),
      );
    } catch (error) {
      this.rethrowUnique(error, 'کد شهر در این استان تکراری است');
    }
  }

  async updateCity(id: string, dto: UpdateCityDto) {
    const current = await this.findCity(id);
    if (dto.provinceId) {
      await this.assertProvince(dto.provinceId);
    }
    const provinceId = dto.provinceId ?? current.provinceId;
    try {
      return withCoords(
        await this.prisma.$transaction(async (tx) => {
          if (dto.isProvinceCapital) {
            await this.clearOtherProvinceCapitals(tx, provinceId, id);
          }
          return tx.city.update({
            where: { id },
            data: this.cityData(dto),
            select: citySelect,
          });
        }),
      );
    } catch (error) {
      this.rethrowUnique(error, 'کد شهر در این استان تکراری است');
    }
  }

  async removeCity(id: string) {
    await this.findCity(id);
    await this.prisma.city.delete({ where: { id } });
    return { ok: true };
  }

  private countryData(dto: CreateCountryDto | UpdateCountryDto) {
    return {
      iso2: dto.iso2,
      iso3: dto.iso3,
      phoneCode: dto.phoneCode,
      nameFa: dto.nameFa?.trim(),
      nameEn: dto.nameEn?.trim(),
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };
  }

  private provinceData(dto: CreateProvinceDto | UpdateProvinceDto) {
    return {
      countryId: dto.countryId,
      code: dto.code,
      nameFa: dto.nameFa?.trim(),
      nameEn: dto.nameEn?.trim(),
      neshanAddress: dto.neshanAddress,
      latitude: toDecimal(dto.latitude),
      longitude: toDecimal(dto.longitude),
      hasRailway: dto.hasRailway,
      hasAirport: dto.hasAirport,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };
  }

  private cityData(dto: CreateCityDto | UpdateCityDto) {
    return {
      provinceId: dto.provinceId,
      code: dto.code,
      nameFa: dto.nameFa?.trim(),
      nameEn: dto.nameEn?.trim(),
      neshanAddress: dto.neshanAddress,
      latitude: toDecimal(dto.latitude),
      longitude: toDecimal(dto.longitude),
      isProvinceCapital: dto.isProvinceCapital,
      hasRailway: dto.hasRailway,
      hasAirport: dto.hasAirport,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };
  }

  private async clearOtherProvinceCapitals(
    tx: Prisma.TransactionClient,
    provinceId: string,
    exceptCityId?: string,
  ) {
    await tx.city.updateMany({
      where: {
        provinceId,
        isProvinceCapital: true,
        ...(exceptCityId ? { id: { not: exceptCityId } } : {}),
      },
      data: { isProvinceCapital: false },
    });
  }

  private async assertCountry(id: string) {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) {
      throw new NotFoundException('کشور یافت نشد');
    }
  }

  private async assertProvince(id: string) {
    const province = await this.prisma.province.findUnique({ where: { id } });
    if (!province) {
      throw new NotFoundException('استان یافت نشد');
    }
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
