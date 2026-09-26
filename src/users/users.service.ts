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
import {
  CONTRACTOR_ROLE_CODE,
  ensureCitizenRole,
  ensureEmployeeRole,
} from '../access/access.constants';
import { parseOptionalIsoDate, toIsoDateOnly } from '../common/iso-date';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { joinFullName } from './user-profile.util';
import { CITY_ID_NONE, FindUsersQueryDto } from './dto/find-users-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FindLocationHistoryQueryDto } from './dto/find-location-history-query.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
import { parseQeshmondiExcel } from './qeshmondi-import';

const QESHMONDI_IMPORT_PASSWORD = '11111111';

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
  fatherName: true,
  birthDate: true,
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
  isQeshmondi: true,
  qeshmondiStartDate: true,
  qeshmondiEndDate: true,
  occupation: true,
  isResident: true,
  passportNumber: true,
  createdAt: true,
  updatedAt: true,
  orgUnit: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  contractorId: true,
  contractor: { select: { id: true, name: true } },
  userRoles: {
    select: {
      role: { select: { id: true, code: true, name: true } },
    },
    orderBy: { role: { name: 'asc' } },
  },
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
    qeshmondiStartDate?: Date | null;
    qeshmondiEndDate?: Date | null;
    birthDate?: Date | null;
    userRoles?: { role: { id: string; code: string; name: string } }[];
  },
>(user: T) {
  const { userRoles, qeshmondiStartDate, qeshmondiEndDate, birthDate, ...rest } = user;
  return {
    ...rest,
    latitude: toCoord(user.latitude),
    longitude: toCoord(user.longitude),
    qeshmondiStartDate: toIsoDateOnly(qeshmondiStartDate),
    qeshmondiEndDate: toIsoDateOnly(qeshmondiEndDate),
    birthDate: toIsoDateOnly(birthDate),
    roles: userRoles?.map((item) => item.role) ?? [],
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
      ...(query.roleId ? { userRoles: { some: { roleId: query.roleId } } } : {}),
      ...(query.employeesOnly ? { orgUnitId: query.orgUnitId ?? { not: null } } : {}),
      ...(query.qeshmondiOnly ? { isQeshmondi: true } : {}),
      ...(query.isResident !== undefined ? { isResident: query.isResident } : {}),
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
            { occupation: containsInsensitive(q) },
            { passportNumber: containsInsensitive(q) },
            { fatherName: containsInsensitive(q) },
            ...(digits
              ? [
                  { nationalId: { contains: digits } },
                  { phone: { contains: digits } },
                  { passportNumber: { contains: digits } },
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
        occupation: (dir) => ({ occupation: dir }),
        isResident: (dir) => ({ isResident: dir }),
        qeshmondiStartDate: (dir) => ({ qeshmondiStartDate: dir }),
        qeshmondiEndDate: (dir) => ({ qeshmondiEndDate: dir }),
        passportNumber: (dir) => ({ passportNumber: dir }),
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
      birthDate: user.birthDate,
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
    this.assertQeshmondiDates(dto.qeshmondiStartDate, dto.qeshmondiEndDate);
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
        fatherName: dto.fatherName ?? null,
        birthDate: parseOptionalIsoDate(dto.birthDate) ?? null,
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
        isQeshmondi: dto.isQeshmondi ?? false,
        qeshmondiStartDate: parseOptionalIsoDate(dto.qeshmondiStartDate) ?? null,
        qeshmondiEndDate: parseOptionalIsoDate(dto.qeshmondiEndDate) ?? null,
        occupation: dto.occupation ?? null,
        isResident: dto.isResident ?? false,
        passportNumber: dto.passportNumber ?? null,
        contractorId: await this.resolvePortalContractor(dto.roleIds, dto.contractorId),
      },
      select: userSelect,
    });
    await this.assignRolesOnCreate(user.id, dto.roleIds, dto.isQeshmondi);
    return this.findOne(user.id);
  }

  async importQeshmondiExcel(file?: { buffer?: Buffer; originalname?: string }) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('فایل اکسل را انتخاب کنید');
    }
    const name = file.originalname?.toLowerCase() ?? '';
    if (name && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      throw new BadRequestException('فقط فایل اکسل با پسوند xlsx مجاز است');
    }
    let parsed;
    try {
      parsed = await parseQeshmondiExcel(file.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خواندن فایل اکسل ممکن نبود';
      throw new BadRequestException(message);
    }

    const passwordHash = await bcrypt.hash(QESHMONDI_IMPORT_PASSWORD, 10);
    const citizen = await ensureCitizenRole(this.prisma);
    let created = 0;
    let updated = 0;
    const seen = new Set<string>();

    for (const row of parsed.rows) {
      if (seen.has(row.nationalId)) {
        parsed.skipped.push({
          rowNumber: row.rowNumber,
          reason: 'کد ملی تکراری در همین فایل',
        });
        continue;
      }
      seen.add(row.nationalId);

      const existing = await this.prisma.user.findFirst({
        where: { nationalId: row.nationalId },
        select: { id: true, username: true },
      });
      const payload = {
        firstName: row.firstName,
        lastName: row.lastName,
        fullName: joinFullName(row.firstName, row.lastName),
        fatherName: row.fatherName,
        birthDate: parseOptionalIsoDate(row.birthDate) ?? null,
        gender: row.gender,
        passportNumber: row.passportNumber,
        occupation: row.occupation,
        isResident: row.isResident,
        qeshmondiEndDate: parseOptionalIsoDate(row.qeshmondiEndDate) ?? null,
        isQeshmondi: true,
      };

      if (existing) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: payload,
        });
        await this.ensureCitizenAssigned(existing.id);
        updated += 1;
        continue;
      }

      const username = await this.uniqueImportUsername(row.nationalId);
      const user = await this.prisma.user.create({
        data: {
          username,
          passwordHash,
          locale: 'fa',
          status: UserStatus.ACTIVE,
          nationalId: row.nationalId,
          ...payload,
        },
        select: { id: true },
      });
      await this.prisma.userRole.create({
        data: { userId: user.id, roleId: citizen.id },
      });
      created += 1;
    }

    return {
      created,
      updated,
      skipped: parsed.skipped.length,
      skippedRows: parsed.skipped,
    };
  }

  private async uniqueImportUsername(nationalId: string) {
    const taken = await this.prisma.user.findUnique({
      where: { username: nationalId },
      select: { id: true },
    });
    if (!taken) return nationalId;
    return `${nationalId}-${Date.now().toString(36)}`;
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
    if (dto.qeshmondiStartDate !== undefined || dto.qeshmondiEndDate !== undefined) {
      const current = await this.prisma.user.findUnique({
        where: { id },
        select: { qeshmondiStartDate: true, qeshmondiEndDate: true },
      });
      this.assertQeshmondiDates(
        dto.qeshmondiStartDate !== undefined
          ? dto.qeshmondiStartDate
          : toIsoDateOnly(current?.qeshmondiStartDate),
        dto.qeshmondiEndDate !== undefined
          ? dto.qeshmondiEndDate
          : toIsoDateOnly(current?.qeshmondiEndDate),
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
      isQeshmondi: dto.isQeshmondi,
      qeshmondiStartDate:
        dto.qeshmondiStartDate === undefined
          ? undefined
          : parseOptionalIsoDate(dto.qeshmondiStartDate),
      qeshmondiEndDate:
        dto.qeshmondiEndDate === undefined
          ? undefined
          : parseOptionalIsoDate(dto.qeshmondiEndDate),
      occupation: dto.occupation === undefined ? undefined : dto.occupation,
      isResident: dto.isResident,
      passportNumber: dto.passportNumber === undefined ? undefined : dto.passportNumber,
      contractor:
        dto.roleIds !== undefined || dto.contractorId !== undefined
          ? optionalConnect(
              await this.resolvePortalContractor(
                dto.roleIds ??
                  (
                    await this.prisma.userRole.findMany({
                      where: { userId: id },
                      select: { roleId: true },
                    })
                  ).map((item) => item.roleId),
                dto.contractorId === undefined
                  ? (
                      await this.prisma.user.findUnique({
                        where: { id },
                        select: { contractorId: true },
                      })
                    )?.contractorId
                  : dto.contractorId,
              ),
            )
          : undefined,
      fatherName: dto.fatherName === undefined ? undefined : dto.fatherName,
      birthDate:
        dto.birthDate === undefined ? undefined : parseOptionalIsoDate(dto.birthDate),
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
    if (dto.roleIds !== undefined) {
      await this.syncUserRoles(id, dto.roleIds);
    }
    if (dto.isQeshmondi || (dto.isQeshmondi === undefined && user.isQeshmondi)) {
      await this.ensureCitizenAssigned(id);
    }
    return this.findOne(id);
  }

  async updateOwnAccount(id: string, dto: UpdateUserDto) {
    const {
      status: _status,
      password: _password,
      roleIds: _roleIds,
      orgUnitId: _orgUnitId,
      positionId: _positionId,
      isQeshmondi: _isQeshmondi,
      qeshmondiStartDate: _qeshmondiStartDate,
      qeshmondiEndDate: _qeshmondiEndDate,
      isResident: _isResident,
      contractorId: _contractorId,
      ...rest
    } = dto;
    return this.update(id, rest);
  }

  async remove(id: string) {
    await this.findOne(id);
    const assigned = await this.prisma.vehicleAssignment.count({
      where: { personId: id },
    });
    if (assigned > 0) {
      throw new ConflictException(
        'ابتدا تخصیص وسایل نقلیه این شخص را ببندید یا حذف کنید',
      );
    }
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

  private async resolvePortalContractor(
    roleIds: string[] | undefined,
    contractorId: string | null | undefined,
  ) {
    const unique = [...new Set((roleIds ?? []).filter(Boolean))];
    if (!unique.length) {
      return null;
    }
    const roles = await this.prisma.role.findMany({
      where: { id: { in: unique } },
      select: { code: true },
    });
    if (!roles.some((role) => role.code === CONTRACTOR_ROLE_CODE)) {
      return null;
    }
    if (!contractorId) {
      throw new BadRequestException('پیمانکار کاربر درگاه را انتخاب کنید');
    }
    const contractor = await this.prisma.projectContractor.findUnique({
      where: { id: contractorId },
      select: { id: true },
    });
    if (!contractor) {
      throw new NotFoundException('پیمانکار یافت نشد');
    }
    return contractorId;
  }

  private assertQeshmondiDates(start?: string | null, end?: string | null) {
    if (start && end && start > end) {
      throw new BadRequestException('تاریخ پایان قشموندی نمی‌تواند قبل از تاریخ شروع باشد');
    }
  }

  private async assignRolesOnCreate(
    userId: string,
    roleIds?: string[],
    isQeshmondi?: boolean,
  ) {
    const unique = [...new Set((roleIds ?? []).filter(Boolean))];
    if (isQeshmondi) {
      const citizen = await ensureCitizenRole(this.prisma);
      if (!unique.includes(citizen.id)) unique.push(citizen.id);
      await this.syncUserRoles(userId, unique);
      return;
    }
    if (unique.length) {
      await this.syncUserRoles(userId, unique);
      return;
    }
    const employee = await ensureEmployeeRole(this.prisma);
    await this.prisma.userRole.create({
      data: { userId, roleId: employee.id },
    });
  }

  private async ensureCitizenAssigned(userId: string) {
    const citizen = await ensureCitizenRole(this.prisma);
    await this.prisma.userRole.createMany({
      data: [{ userId, roleId: citizen.id }],
      skipDuplicates: true,
    });
  }

  private async syncUserRoles(userId: string, roleIds: string[]) {
    const unique = [...new Set(roleIds.filter(Boolean))];
    if (!unique.length) {
      throw new BadRequestException('حداقل یک نقش را انتخاب کنید');
    }
    const found = await this.prisma.role.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException('نقش انتخاب‌شده معتبر نیست');
    }
    await this.prisma.userRole.deleteMany({
      where: { userId, roleId: { notIn: unique } },
    });
    await this.prisma.userRole.createMany({
      data: unique.map((roleId) => ({ userId, roleId })),
      skipDuplicates: true,
    });
  }
}
