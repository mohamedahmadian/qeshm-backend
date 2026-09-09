import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import {
  normalizeNationalId,
  toLatinDigits,
} from '../common/national-id';
import { normalizePhone, phoneLookupValues } from '../common/phone';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { joinFullName } from './user-profile.util';
import { CITY_ID_NONE, FindUsersQueryDto } from './dto/find-users-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FindLocationHistoryQueryDto } from './dto/find-location-history-query.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';

const geoNameSelect = { id: true, nameFa: true, nameEn: true } as const;

const userSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  fullName: true,
  locale: true,
  status: true,
  gender: true,
  nationalId: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
  religion: true,
  religionOther: true,
  telegram: true,
  bale: true,
  eitaa: true,
  whatsapp: true,
  otherSocial: true,
  vehiclePlates: true,
  countryId: true,
  provinceId: true,
  cityId: true,
  locationProvinceId: true,
  locationCityId: true,
  latitude: true,
  longitude: true,
  locationNotes: true,
  locationUpdatedAt: true,
  photoId: true,
  nationalCardPhotoId: true,
  passportPhotoId: true,
  identityBookletPhotoId: true,
  orgUnitId: true,
  positionId: true,
  createdAt: true,
  updatedAt: true,
  orgUnit: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  country: { select: geoNameSelect },
  province: { select: { ...geoNameSelect, countryId: true } },
  city: { select: { ...geoNameSelect, provinceId: true } },
  locationProvince: { select: { ...geoNameSelect, countryId: true } },
  locationCity: { select: { ...geoNameSelect, provinceId: true } },
} satisfies Prisma.UserSelect;

function toCoord(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value);
}

function optionalConnect(id: string | null | undefined) {
  if (id === undefined) return undefined;
  return id ? { connect: { id } } : { disconnect: true };
}

function mapUser<
  T extends {
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
  },
>(user: T) {
  return {
    ...user,
    latitude: toCoord(user.latitude),
    longitude: toCoord(user.longitude),
    roles: [],
    birthDate: null,
    activityStartYear: null,
    issuingOrganizationId: null,
    issuingOrganization: null,
  };
}

function randomTempPassword() {
  return `Aa${Math.random().toString(36).slice(2, 8)}1!`;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async findAll(query: FindUsersQueryDto) {
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const where: Prisma.UserWhereInput = {
      status: query.status,
      countryId: query.countryId,
      orgUnitId: query.orgUnitId,
      positionId: query.positionId,
      ...(query.employeesOnly ? { orgUnitId: query.orgUnitId ?? { not: null } } : {}),
      provinceId: query.provinceId,
      cityId:
        query.cityId === CITY_ID_NONE
          ? null
          : query.cityId,
      OR: q
        ? [
            { fullName: containsInsensitive(q) },
            { firstName: containsInsensitive(q) },
            { lastName: containsInsensitive(q) },
            { username: containsInsensitive(q) },
            { email: containsInsensitive(q) },
            ...(digits
              ? [
                  { nationalId: { contains: digits } },
                  { phone: { contains: digits } },
                ]
              : []),
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.UserOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        fullName: (dir) => ({ fullName: dir }),
        username: (dir) => ({ username: dir }),
        phone: (dir) => ({ phone: dir }),
        status: (dir) => ({ status: dir }),
        nationalId: (dir) => ({ nationalId: dir }),
        city: (dir) => ({ city: { nameFa: dir } }),
        createdAt: (dir) => ({ createdAt: dir }),
        orgUnit: (dir) => ({ orgUnit: { name: dir } }),
        position: (dir) => ({ position: { name: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.user.findMany({
        where,
        orderBy,
        select: userSelect,
      });
      return items.map(mapUser);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take,
        select: userSelect,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginatedResult(items.map(mapUser), total, page, pageSize);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }
    return mapUser(user);
  }

  async findPublicProfile(id: string) {
    const user = await this.findOne(id);
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      gender: user.gender,
      nationalId: user.nationalId,
      phone: user.phone,
      photoId: user.photoId,
      activityStartYear: null,
      country: user.country,
      province: user.province,
      city: user.city,
      roles: [],
      caravans: [],
      accommodations: [],
      pilgrimages: [],
    };
  }

  async create(dto: CreateUserDto) {
    await this.assertUnique(dto);
    await this.assertGeo(dto.countryId, dto.provinceId, dto.cityId);
    await this.assertImages(dto);
    await this.assertOrgAssignment(dto.orgUnitId, dto.positionId);
    const passwordHash = await bcrypt.hash(toLatinDigits(dto.password), 10);
    const user = await this.prisma.user.create({
      data: {
        username: toLatinDigits(dto.username.trim()),
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        fullName: joinFullName(dto.firstName, dto.lastName),
        locale: dto.locale ?? 'fa',
        status: dto.status ?? UserStatus.ACTIVE,
        gender: dto.gender ?? null,
        nationalId: dto.nationalId || null,
        phone: dto.phone || null,
        email: dto.email || null,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
        religion: dto.religion ?? null,
        religionOther: dto.religionOther ?? null,
        telegram: dto.telegram ?? null,
        bale: dto.bale ?? null,
        eitaa: dto.eitaa ?? null,
        whatsapp: dto.whatsapp ?? null,
        otherSocial: dto.otherSocial ?? null,
        vehiclePlates: dto.vehiclePlates ?? [],
        countryId: dto.countryId ?? null,
        provinceId: dto.provinceId ?? null,
        cityId: dto.cityId ?? null,
        photoId: dto.photoId ?? null,
        nationalCardPhotoId: dto.nationalCardPhotoId ?? null,
        passportPhotoId: dto.passportPhotoId ?? null,
        identityBookletPhotoId: dto.identityBookletPhotoId ?? null,
        orgUnitId: dto.orgUnitId ?? null,
        positionId: dto.positionId ?? null,
      },
      select: userSelect,
    });
    return mapUser(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    await this.assertUnique(dto, id);
    await this.assertImages(dto);
    if (dto.orgUnitId !== undefined || dto.positionId !== undefined) {
      const current = await this.prisma.user.findUnique({ where: { id } });
      await this.assertOrgAssignment(
        dto.orgUnitId !== undefined ? dto.orgUnitId : current?.orgUnitId,
        dto.positionId !== undefined ? dto.positionId : current?.positionId,
      );
    }
    if (dto.countryId !== undefined || dto.provinceId !== undefined || dto.cityId !== undefined) {
      const current = await this.prisma.user.findUnique({ where: { id } });
      await this.assertGeo(
        dto.countryId !== undefined ? dto.countryId : current?.countryId,
        dto.provinceId !== undefined ? dto.provinceId : current?.provinceId,
        dto.cityId !== undefined ? dto.cityId : current?.cityId,
      );
    }
    const data: Prisma.UserUpdateInput = {
      username: dto.username ? toLatinDigits(dto.username.trim()) : undefined,
      firstName: dto.firstName?.trim(),
      lastName: dto.lastName?.trim(),
      fullName:
        dto.firstName || dto.lastName
          ? joinFullName(
              dto.firstName ?? (await this.findOne(id)).firstName,
              dto.lastName ?? (await this.findOne(id)).lastName,
            )
          : undefined,
      locale: dto.locale,
      status: dto.status,
      gender: dto.gender === undefined ? undefined : dto.gender,
      nationalId: dto.nationalId === undefined ? undefined : dto.nationalId,
      phone: dto.phone === undefined ? undefined : dto.phone,
      email: dto.email === undefined ? undefined : dto.email,
      address: dto.address === undefined ? undefined : dto.address,
      notes: dto.notes === undefined ? undefined : dto.notes,
      religion: dto.religion === undefined ? undefined : dto.religion,
      religionOther: dto.religionOther === undefined ? undefined : dto.religionOther,
      telegram: dto.telegram === undefined ? undefined : dto.telegram,
      bale: dto.bale === undefined ? undefined : dto.bale,
      eitaa: dto.eitaa === undefined ? undefined : dto.eitaa,
      whatsapp: dto.whatsapp === undefined ? undefined : dto.whatsapp,
      otherSocial: dto.otherSocial === undefined ? undefined : dto.otherSocial,
      vehiclePlates: dto.vehiclePlates,
      country: optionalConnect(dto.countryId),
      province: optionalConnect(dto.provinceId),
      city: optionalConnect(dto.cityId),
      photo: optionalConnect(dto.photoId),
      nationalCardPhoto: optionalConnect(dto.nationalCardPhotoId),
      passportPhoto: optionalConnect(dto.passportPhotoId),
      identityBookletPhoto: optionalConnect(dto.identityBookletPhotoId),
      orgUnit: optionalConnect(dto.orgUnitId),
      position: optionalConnect(dto.positionId),
    };
    if (dto.orgUnitId !== undefined) {
      await this.prisma.organizationUnit.updateMany({
        where: {
          nutritionRepId: id,
          ...(dto.orgUnitId ? { id: { not: dto.orgUnitId } } : {}),
        },
        data: { nutritionRepId: null },
      });
    }
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(toLatinDigits(dto.password), 10);
    }
    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });
    return mapUser(user);
  }

  async updateOwnAccount(id: string, dto: UpdateUserDto) {
    const { status: _status, password: _password, ...rest } = dto;
    return this.update(id, rest);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  async updateLocation(id: string, dto: UpdateUserLocationDto) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        locationProvinceId: dto.provinceId === undefined ? undefined : dto.provinceId,
        locationCityId: dto.cityId === undefined ? undefined : dto.cityId,
        latitude: dto.latitude === undefined ? undefined : dto.latitude,
        longitude: dto.longitude === undefined ? undefined : dto.longitude,
        locationNotes: dto.notes === undefined ? undefined : dto.notes,
        locationUpdatedAt: new Date(),
      },
      select: userSelect,
    });
    await this.prisma.userLocationHistory.create({
      data: {
        userId: id,
        provinceId: dto.provinceId ?? user.locationProvinceId,
        cityId: dto.cityId ?? user.locationCityId,
        latitude: dto.latitude ?? user.latitude,
        longitude: dto.longitude ?? user.longitude,
        notes: dto.notes ?? user.locationNotes,
        source: dto.source ?? 'MANUAL',
      },
    });
    return mapUser(user);
  }

  async findLocationHistory(userId: string, query: FindLocationHistoryQueryDto) {
    await this.findOne(userId);
    const q = query.q?.trim();
    const where: Prisma.UserLocationHistoryWhereInput = {
      userId,
      source: query.source,
      OR: q
        ? [
            { notes: containsInsensitive(q) },
            { province: { nameFa: containsInsensitive(q) } },
            { city: { nameFa: containsInsensitive(q) } },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.UserLocationHistoryOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        createdAt: (dir) => ({ createdAt: dir }),
        province: (dir) => ({ province: { nameFa: dir } }),
        city: (dir) => ({ city: { nameFa: dir } }),
        notes: (dir) => ({ notes: dir }),
        source: (dir) => ({ source: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [rows, total, mapPoints] = await Promise.all([
      this.prisma.userLocationHistory.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          province: { select: { ...geoNameSelect, countryId: true } },
          city: { select: { ...geoNameSelect, provinceId: true } },
        },
      }),
      this.prisma.userLocationHistory.count({ where }),
      this.prisma.userLocationHistory.findMany({
        where: { userId, latitude: { not: null }, longitude: { not: null } },
        orderBy: { createdAt: 'asc' },
        include: {
          province: { select: { ...geoNameSelect, countryId: true } },
          city: { select: { ...geoNameSelect, provinceId: true } },
        },
      }),
    ]);
    const toItem = (
      item: (typeof rows)[number],
      seq: number,
    ) => ({
      ...item,
      seq,
      latitude: toCoord(item.latitude),
      longitude: toCoord(item.longitude),
    });
    return {
      ...paginatedResult(
        rows.map((item, index) => toItem(item, total - skip - index)),
        total,
        page,
        pageSize,
      ),
      mapPoints: mapPoints.map((item, index) => toItem(item, index + 1)),
    };
  }

  async removeLocationHistory(userId: string, id: string) {
    const item = await this.prisma.userLocationHistory.findFirst({
      where: { id, userId },
    });
    if (!item) {
      throw new NotFoundException('نقطه مکانی یافت نشد');
    }
    await this.prisma.userLocationHistory.delete({ where: { id } });
    return { ok: true };
  }

  async removeAllLocationHistory(userId: string) {
    await this.findOne(userId);
    await this.prisma.userLocationHistory.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async forgotPasswordByIdentifier(
    identifier: string,
    channel: 'sms' | 'email',
  ) {
    const user = await this.findActiveByIdentifier(identifier);
    if (!user) {
      return { status: 'not_found' as const };
    }
    if (channel === 'email') {
      return { status: 'no_email' as const };
    }
    if (!user.phone?.trim()) {
      return { status: 'no_phone' as const };
    }
    const password = randomTempPassword();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    const sms = await this.sms.send({
      phone: user.phone,
      body: `رمز عبور موقت شما: ${password}`,
    });
    return {
      status: 'sent' as const,
      sms,
    };
  }

  async findActiveByIdentifier(identifier: string) {
    const value = toLatinDigits(identifier.trim());
    const nationalId = normalizeNationalId(value);
    const or: Prisma.UserWhereInput[] = [{ username: value }];
    if (nationalId) or.push({ nationalId });
    for (const phone of phoneLookupValues(value)) {
      or.push({ phone });
    }
    return this.prisma.user.findFirst({
      where: { OR: or, status: UserStatus.ACTIVE },
    });
  }

  async checkIdentityTaken(dto: {
    nationalId?: string;
    phone?: string;
    username?: string;
    email?: string;
    excludeId?: string;
  }) {
    const nationalId = dto.nationalId?.trim() || undefined;
    const phone = dto.phone?.trim() || undefined;
    const username = dto.username?.trim() || undefined;
    const email = dto.email?.trim().toLowerCase() || undefined;
    if (!nationalId && !phone && !username && !email) {
      throw new BadRequestException('کد ملی، شماره تلفن، ایمیل یا نام کاربری لازم است');
    }
    const exclude = dto.excludeId ? { NOT: { id: dto.excludeId } } : {};
    const [nationalIdHit, phoneHit, usernameHit, emailHit] = await Promise.all([
      nationalId
        ? this.prisma.user.findFirst({
            where: { nationalId, ...exclude },
            select: { id: true, fullName: true },
          })
        : Promise.resolve(null),
      phone
        ? this.prisma.user.findFirst({
            where: { phone, ...exclude },
            select: { id: true },
          })
        : Promise.resolve(null),
      username
        ? this.prisma.user.findFirst({
            where: { username, ...exclude },
            select: { id: true },
          })
        : Promise.resolve(null),
      email
        ? this.prisma.user.findFirst({
            where: { email, ...exclude },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      taken: Boolean(nationalIdHit || phoneHit || usernameHit || emailHit),
      nationalIdTaken: Boolean(nationalIdHit),
      nationalIdOwnerName: nationalIdHit?.fullName?.trim() || null,
      phoneTaken: Boolean(phoneHit),
      usernameTaken: Boolean(usernameHit),
      emailTaken: Boolean(emailHit),
    };
  }

  private async assertUnique(
    dto: {
      username?: string;
      nationalId?: string | null;
      phone?: string | null;
      email?: string | null;
    },
    excludeId?: string,
  ) {
    if (dto.username) {
      const username = toLatinDigits(dto.username.trim());
      const taken = await this.prisma.user.findFirst({
        where: { username, id: excludeId ? { not: excludeId } : undefined },
      });
      if (taken) {
        throw new ConflictException('این نام کاربری قبلاً ثبت شده است');
      }
    }
    if (dto.nationalId) {
      const taken = await this.prisma.user.findFirst({
        where: {
          nationalId: dto.nationalId,
          id: excludeId ? { not: excludeId } : undefined,
        },
      });
      if (taken) {
        throw new ConflictException('این کد ملی قبلاً ثبت شده است');
      }
    }
    if (dto.phone) {
      const taken = await this.prisma.user.findFirst({
        where: {
          phone: dto.phone,
          id: excludeId ? { not: excludeId } : undefined,
        },
      });
      if (taken) {
        throw new ConflictException('این تلفن همراه قبلاً ثبت شده است');
      }
    }
    if (dto.email) {
      const taken = await this.prisma.user.findFirst({
        where: {
          email: dto.email,
          id: excludeId ? { not: excludeId } : undefined,
        },
      });
      if (taken) {
        throw new ConflictException('این ایمیل قبلاً ثبت شده است');
      }
    }
  }

  private async assertImages(dto: {
    photoId?: string | null;
    nationalCardPhotoId?: string | null;
    passportPhotoId?: string | null;
    identityBookletPhotoId?: string | null;
  }) {
    const ids = [
      dto.photoId,
      dto.nationalCardPhotoId,
      dto.passportPhotoId,
      dto.identityBookletPhotoId,
    ].filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    const count = await this.prisma.storedImage.count({
      where: { id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new BadRequestException('تصویر معتبر نیست');
    }
  }

  private async assertOrgAssignment(
    orgUnitId?: string | null,
    positionId?: string | null,
  ) {
    if (orgUnitId) {
      const unit = await this.prisma.organizationUnit.findUnique({
        where: { id: orgUnitId },
        select: { id: true },
      });
      if (!unit) throw new BadRequestException('واحد سازمانی معتبر نیست');
    }
    if (positionId) {
      const position = await this.prisma.organizationPosition.findUnique({
        where: { id: positionId },
        select: { id: true },
      });
      if (!position) throw new BadRequestException('سمت معتبر نیست');
    }
  }

  private async assertGeo(
    countryId?: string | null,
    provinceId?: string | null,
    cityId?: string | null,
  ) {
    if (countryId) {
      const country = await this.prisma.country.findUnique({
        where: { id: countryId },
      });
      if (!country) throw new BadRequestException('کشور معتبر نیست');
    }
    if (provinceId) {
      const province = await this.prisma.province.findUnique({
        where: { id: provinceId },
      });
      if (!province) throw new BadRequestException('استان معتبر نیست');
      if (countryId && province.countryId !== countryId) {
        throw new BadRequestException('استان متعلق به این کشور نیست');
      }
    }
    if (cityId) {
      const city = await this.prisma.city.findUnique({
        where: { id: cityId },
      });
      if (!city) throw new BadRequestException('شهر معتبر نیست');
      if (provinceId && city.provinceId !== provinceId) {
        throw new BadRequestException('شهر متعلق به این استان نیست');
      }
    }
  }
}
