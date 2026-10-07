import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
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
import { gregorianToJalali } from '../common/jalali-date';
import { parseIsoDate, parseOptionalIsoDate, todayIsoDateTehran, toIsoDateOnly } from '../common/iso-date';
import { getRequestLocale, isLtrLocale, localizedGeoName } from '../common/request-locale';
import { buildStyledExcelExport } from '../common/excel-export';
import {
  Prisma,
  QeshmondiSyncSource,
  QeshmondiSyncStatus,
  UserGender,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { joinFullName } from './user-profile.util';
import {
  CITY_ID_NONE,
  FindUsersQueryDto,
  type QeshmondiValidityFilter,
} from './dto/find-users-query.dto';
import { SearchQeshmondiQueryDto } from './dto/search-qeshmondi-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FindLocationHistoryQueryDto } from './dto/find-location-history-query.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
import { parseQeshmondiExcel, type QeshmondiCitizenProfile, type QeshmondiImportRow } from './qeshmondi-import';
import { qeshmondiSqlErrorText, streamQeshmondiSqlPeople, type QeshmondiSqlSettings } from './qeshmondi-sql';
import { ensureQeshmondiLookups } from './qeshmondi-lookup';
import { finishQeshmondiSyncLog, openQeshmondiSyncLog } from './qeshmondi-sync-log';

const QESHMONDI_IMPORT_PASSWORD = '11111111';
const QESHMONDI_LOOKUP_CHUNK = 5000;
const QESHMONDI_WRITE_CHUNK = 2000;
const QESHMONDI_SQL_WRITE_CHUNK = 400;
const QESHMONDI_IMPORT_JOB_TTL_MS = 30 * 60 * 1000;

type QeshmondiImportJobPhase = 'parsing' | 'saving' | 'done' | 'error';
type QeshmondiImportStep = 'lookup' | 'writing' | 'roles' | 'syncing';

type QeshmondiImportSkip = { rowNumber: number; reason: string };

type QeshmondiImportResult = {
  created: number;
  updated: number;
  skipped: number;
};

type QeshmondiImportJob = {
  id: string;
  logId?: string;
  phase: QeshmondiImportJobPhase;
  step?: QeshmondiImportStep;
  percent: number;
  processed: number;
  total: number;
  result?: QeshmondiImportResult;
  createdRows?: QeshmondiImportRow[];
  skippedRows?: QeshmondiImportSkip[];
  error?: string;
  updatedAt: number;
};

const geoNameSelect = { id: true, nameFa: true, nameEn: true } as const;

const qeshmondiProfileSelect = {
  id: true,
  firstName: true,
  lastName: true,
  fullName: true,
  fatherName: true,
  nationalId: true,
  gender: true,
  birthDate: true,
  phone: true,
  photoId: true,
  occupation: true,
  isResident: true,
  passportNumber: true,
  qeshmondiGroup: true,
  qeshmondiStartDate: true,
  qeshmondiEndDate: true,
  individualTicketQuota: true,
  province: { select: geoNameSelect },
  city: { select: geoNameSelect },
} satisfies Prisma.UserSelect;

const QESHMONDI_SEARCH_LIMIT = 50;

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
  qeshmondiGroup: true,
  latinFirstName: true,
  latinLastName: true,
  latinFatherName: true,
  identityNumber: true,
  identitySerial: true,
  landlinePhone: true,
  fax: true,
  postalCode: true,
  jobAddress: true,
  jobPhone: true,
  jobFax: true,
  jobPostalCode: true,
  isSingle: true,
  nationality: true,
  education: true,
  protectorOffice: true,
  nationalIdExpiresAt: true,
  passportExpiresAt: true,
  bankFullName: true,
  bankFullLatinName: true,
  accountNumber: true,
  cardNumber: true,
  cardSeries: true,
  isBank: true,
  accountOpeningDate: true,
  cardIssuanceDate: true,
  cardDeliverDate: true,
  companyName: true,
  companySubject: true,
  companyLicenseNumber: true,
  companyLicenseDate: true,
  companyPaperNumber: true,
  companyPaperDate: true,
  electricitySubscription: true,
  individualTicketQuota: true,
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
    nationalIdExpiresAt?: Date | null;
    passportExpiresAt?: Date | null;
    accountOpeningDate?: Date | null;
    cardIssuanceDate?: Date | null;
    cardDeliverDate?: Date | null;
    companyLicenseDate?: Date | null;
    companyPaperDate?: Date | null;
    fingerprint?: Uint8Array | null;
    userRoles?: { role: { id: string; code: string; name: string } }[];
  },
>(user: T) {
  const {
    userRoles,
    qeshmondiStartDate,
    qeshmondiEndDate,
    birthDate,
    nationalIdExpiresAt,
    passportExpiresAt,
    accountOpeningDate,
    cardIssuanceDate,
    cardDeliverDate,
    companyLicenseDate,
    companyPaperDate,
    fingerprint,
    ...rest
  } = user;
  const hasFingerprint =
    'fingerprint' in user ? Boolean(fingerprint && fingerprint.byteLength > 0) : undefined;
  return {
    ...rest,
    latitude: toCoord(user.latitude),
    longitude: toCoord(user.longitude),
    qeshmondiStartDate: toIsoDateOnly(qeshmondiStartDate),
    qeshmondiEndDate: toIsoDateOnly(qeshmondiEndDate),
    birthDate: toIsoDateOnly(birthDate),
    nationalIdExpiresAt: toIsoDateOnly(nationalIdExpiresAt),
    passportExpiresAt: toIsoDateOnly(passportExpiresAt),
    accountOpeningDate: toIsoDateOnly(accountOpeningDate),
    cardIssuanceDate: toIsoDateOnly(cardIssuanceDate),
    cardDeliverDate: toIsoDateOnly(cardDeliverDate),
    companyLicenseDate: toIsoDateOnly(companyLicenseDate),
    companyPaperDate: toIsoDateOnly(companyPaperDate),
    ...(hasFingerprint === undefined ? {} : { hasFingerprint }),
    roles: userRoles?.map((item) => item.role) ?? [],
    activityStartYear: null,
    issuingOrganizationId: null,
    issuingOrganization: null,
  };
}

function blank(value: string | null | undefined) {
  return value ?? '';
}

function citizenSqlPayload(row: QeshmondiImportRow) {
  const citizen: Partial<QeshmondiCitizenProfile> = row.citizen ?? {};
  return {
    group_name: blank(citizen.qeshmondiGroup),
    latin_first_name: blank(citizen.latinFirstName),
    latin_last_name: blank(citizen.latinLastName),
    latin_father_name: blank(citizen.latinFatherName),
    identity_number: blank(citizen.identityNumber),
    identity_serial: blank(citizen.identitySerial),
    landline_phone: blank(citizen.landlinePhone),
    fax: blank(citizen.fax),
    postal_code: blank(citizen.postalCode),
    job_address: blank(citizen.jobAddress),
    job_phone: blank(citizen.jobPhone),
    job_fax: blank(citizen.jobFax),
    job_postal_code: blank(citizen.jobPostalCode),
    is_single: citizen.isSingle ?? null,
    nationality: blank(citizen.nationality),
    education: blank(citizen.education),
    protector_office: blank(citizen.protectorOffice),
    religion: citizen.religion ?? '',
    religion_other: citizen.religionOther ?? '',
    national_id_expires: blank(citizen.nationalIdExpiresAt),
    passport_expires: blank(citizen.passportExpiresAt),
    bank_full_name: blank(citizen.bankFullName),
    bank_full_latin_name: blank(citizen.bankFullLatinName),
    account_number: blank(citizen.accountNumber),
    card_number: blank(citizen.cardNumber),
    card_series: blank(citizen.cardSeries),
    is_bank: citizen.isBank ?? null,
    account_opening_date: blank(citizen.accountOpeningDate),
    card_issuance_date: blank(citizen.cardIssuanceDate),
    card_deliver_date: blank(citizen.cardDeliverDate),
    company_name: blank(citizen.companyName),
    company_subject: blank(citizen.companySubject),
    company_license_number: blank(citizen.companyLicenseNumber),
    company_license_date: blank(citizen.companyLicenseDate),
    company_paper_number: blank(citizen.companyPaperNumber),
    company_paper_date: blank(citizen.companyPaperDate),
    electricity_subscription: blank(citizen.electricitySubscription),
  };
}

function citizenCreateData(row: QeshmondiImportRow) {
  const citizen = row.citizen;
  if (!citizen) return {};
  return {
    qeshmondiGroup: citizen.qeshmondiGroup,
    latinFirstName: citizen.latinFirstName,
    latinLastName: citizen.latinLastName,
    latinFatherName: citizen.latinFatherName,
    identityNumber: citizen.identityNumber,
    identitySerial: citizen.identitySerial,
    landlinePhone: citizen.landlinePhone,
    fax: citizen.fax,
    postalCode: citizen.postalCode,
    jobAddress: citizen.jobAddress,
    jobPhone: citizen.jobPhone,
    jobFax: citizen.jobFax,
    jobPostalCode: citizen.jobPostalCode,
    isSingle: citizen.isSingle,
    nationality: citizen.nationality,
    education: citizen.education,
    protectorOffice: citizen.protectorOffice,
    religion: citizen.religion,
    religionOther: citizen.religionOther,
    nationalIdExpiresAt: parseOptionalIsoDate(citizen.nationalIdExpiresAt) ?? null,
    passportExpiresAt: parseOptionalIsoDate(citizen.passportExpiresAt) ?? null,
    bankFullName: citizen.bankFullName,
    bankFullLatinName: citizen.bankFullLatinName,
    accountNumber: citizen.accountNumber,
    cardNumber: citizen.cardNumber,
    cardSeries: citizen.cardSeries,
    isBank: citizen.isBank,
    accountOpeningDate: parseOptionalIsoDate(citizen.accountOpeningDate) ?? null,
    cardIssuanceDate: parseOptionalIsoDate(citizen.cardIssuanceDate) ?? null,
    cardDeliverDate: parseOptionalIsoDate(citizen.cardDeliverDate) ?? null,
    companyName: citizen.companyName,
    companySubject: citizen.companySubject,
    companyLicenseNumber: citizen.companyLicenseNumber,
    companyLicenseDate: parseOptionalIsoDate(citizen.companyLicenseDate) ?? null,
    companyPaperNumber: citizen.companyPaperNumber,
    companyPaperDate: parseOptionalIsoDate(citizen.companyPaperDate) ?? null,
    electricitySubscription: citizen.electricitySubscription,
  };
}

function randomTempPassword() {
  return `Aa${Math.random().toString(36).slice(2, 8)}1!`;
}

type QeshmondiGenderCounts = {
  male: number;
  female: number;
  unknown: number;
};

function foldQeshmondiGender(
  rows: { gender: UserGender | null; _count: { _all: number } }[],
): QeshmondiGenderCounts {
  const counts: QeshmondiGenderCounts = { male: 0, female: 0, unknown: 0 };
  for (const row of rows) {
    const count = row._count._all;
    if (row.gender === UserGender.MALE) counts.male += count;
    else if (row.gender === UserGender.FEMALE) counts.female += count;
    else counts.unknown += count;
  }
  return counts;
}

function foldQeshmondiNamedCounts(rows: { name: string | null; count: number }[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const name = row.name?.trim() ?? '';
    totals.set(name, (totals.get(name) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name, 'fa'),
    );
}

function foldQeshmondiYears(dates: (Date | null)[]) {
  const gregorian = isLtrLocale(getRequestLocale());
  const totals = new Map<number, number>();
  for (const date of dates) {
    const iso = toIsoDateOnly(date);
    if (!iso) continue;
    const [year, month, day] = iso.split('-').map(Number);
    if (!year || !month || !day) continue;
    const bucket = gregorian ? year : gregorianToJalali(year, month, day).year;
    totals.set(bucket, (totals.get(bucket) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((left, right) => left.year - right.year);
}

/** معتبر: پایان نگذشته یا خالی. منقضی‌شده: پایان قبل از امروز (تهران). */
function qeshmondiValidityWhere(
  validity?: QeshmondiValidityFilter,
): Prisma.UserWhereInput {
  if (!validity) return {};
  const today = parseIsoDate(todayIsoDateTehran());
  if (validity === 'expired') {
    return { qeshmondiEndDate: { lt: today } };
  }
  return {
    AND: [
      {
        OR: [{ qeshmondiEndDate: null }, { qeshmondiEndDate: { gte: today } }],
      },
    ],
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  private readonly qeshmondiImportJobs = new Map<string, QeshmondiImportJob>();

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
      ...qeshmondiValidityWhere(query.qeshmondiValidity),
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
            { qeshmondiGroup: containsInsensitive(q) },
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
        qeshmondiGroup: (dir) => ({ qeshmondiGroup: dir }),
        individualTicketQuota: (dir) => ({ individualTicketQuota: dir }),
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

  async searchQeshmondi(query: SearchQeshmondiQueryDto) {
    const q = query.q?.trim();
    if (!q) {
      throw new BadRequestException('کد ملی یا نام و نام خانوادگی را وارد کنید');
    }
    const compact = toLatinDigits(q).replace(/\s+/g, '');
    const where: Prisma.UserWhereInput = { isQeshmondi: true };
    if (/^\d+$/.test(compact)) {
      const normalized = normalizeNationalId(compact);
      if (!normalized) {
        throw new BadRequestException('کد ملی معتبر نیست');
      }
      where.nationalId = normalized;
    } else {
      where.fullName = containsInsensitive(q.replace(/\s+/g, ' '));
    }
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: QESHMONDI_SEARCH_LIMIT + 1,
      select: qeshmondiProfileSelect,
    });
    return {
      items: rows.slice(0, QESHMONDI_SEARCH_LIMIT).map(mapQeshmondiProfile),
      hasMore: rows.length > QESHMONDI_SEARCH_LIMIT,
    };
  }

  async qeshmondiBankSummary() {
    const today = parseIsoDate(todayIsoDateTehran());
    const qeshmondi = { isQeshmondi: true } as const;
    const [total, expired, male, female, lastSync, latestUser] = await Promise.all([
      this.prisma.user.count({ where: qeshmondi }),
      this.prisma.user.count({
        where: { ...qeshmondi, qeshmondiEndDate: { lt: today } },
      }),
      this.prisma.user.count({ where: { ...qeshmondi, gender: UserGender.MALE } }),
      this.prisma.user.count({ where: { ...qeshmondi, gender: UserGender.FEMALE } }),
      this.prisma.qeshmondiSyncLog.findFirst({
        where: { status: QeshmondiSyncStatus.DONE },
        orderBy: [{ finishedAt: 'desc' }, { startedAt: 'desc' }],
        select: { finishedAt: true },
      }),
      this.prisma.user.aggregate({
        where: qeshmondi,
        _max: { updatedAt: true },
      }),
    ]);
    const stamps = [lastSync?.finishedAt, latestUser._max.updatedAt].filter(
      (value): value is Date => value != null,
    );
    const lastUpdatedAt = stamps.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    return {
      total,
      valid: total - expired,
      expired,
      male,
      female,
      lastUpdatedAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null,
    };
  }

  async qeshmondiAnalytics() {
    const today = parseIsoDate(todayIsoDateTehran());
    const base: Prisma.UserWhereInput = { isQeshmondi: true };
    const expiredWhere: Prisma.UserWhereInput = {
      ...base,
      qeshmondiEndDate: { lt: today },
    };
    const validWhere: Prisma.UserWhereInput = {
      ...base,
      OR: [{ qeshmondiEndDate: null }, { qeshmondiEndDate: { gte: today } }],
    };
    const [
      total,
      expired,
      genderTotal,
      genderValid,
      genderExpired,
      occupations,
      groups,
      endDates,
      missingExpiry,
      birthDates,
      missingBirth,
    ] = await Promise.all([
      this.prisma.user.count({ where: base }),
      this.prisma.user.count({ where: expiredWhere }),
      this.prisma.user.groupBy({
        by: ['gender'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['gender'],
        where: validWhere,
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['gender'],
        where: expiredWhere,
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['occupation'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['qeshmondiGroup'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.user.findMany({
        where: { isQeshmondi: true, qeshmondiEndDate: { not: null } },
        select: { qeshmondiEndDate: true },
      }),
      this.prisma.user.count({
        where: { isQeshmondi: true, qeshmondiEndDate: null },
      }),
      this.prisma.user.findMany({
        where: { isQeshmondi: true, birthDate: { not: null } },
        select: { birthDate: true },
      }),
      this.prisma.user.count({
        where: { isQeshmondi: true, birthDate: null },
      }),
    ]);
    return {
      total,
      valid: total - expired,
      expired,
      gender: {
        total: foldQeshmondiGender(genderTotal),
        valid: foldQeshmondiGender(genderValid),
        expired: foldQeshmondiGender(genderExpired),
      },
      byOccupation: foldQeshmondiNamedCounts(
        occupations.map((row) => ({ name: row.occupation, count: row._count._all })),
      ),
      byGroup: foldQeshmondiNamedCounts(
        groups.map((row) => ({ name: row.qeshmondiGroup, count: row._count._all })),
      ),
      byExpiryYear: foldQeshmondiYears(endDates.map((row) => row.qeshmondiEndDate)),
      missingExpiry,
      byBirthYear: foldQeshmondiYears(birthDates.map((row) => row.birthDate)),
      missingBirth,
    };
  }

  async exportQeshmondiBank(format: string) {
    const rows = await this.loadQeshmondiBankRows();
    if (format === 'json') {
      const body = JSON.stringify(rows, null, 2);
      return {
        buffer: Buffer.from(body, 'utf8'),
        mimeType: 'application/json; charset=utf-8',
        fileName: 'قشموندان.json',
      };
    }
    if (format === 'xlsx') {
      return buildStyledExcelExport({
        sheetName: 'قشموندان',
        fileName: 'قشموندان.xlsx',
        columns: [
          { header: 'نام', key: 'firstName', width: 18 },
          { header: 'نام خانوادگی', key: 'lastName', width: 22 },
          { header: 'نام پدر', key: 'fatherName', width: 18 },
          { header: 'کد ملی', key: 'nationalId', width: 16 },
          { header: 'تلفن', key: 'phone', width: 16 },
          { header: 'جنسیت', key: 'gender', width: 12 },
          { header: 'تاریخ تولد', key: 'birthDate', width: 16 },
          { header: 'شغل', key: 'occupation', width: 22 },
          { header: 'مقیم', key: 'isResident', width: 12 },
          { header: 'شماره گذرنامه', key: 'passportNumber', width: 18 },
          { header: 'گروه', key: 'qeshmondiGroup', width: 16 },
          { header: 'سهمیه هفتگی', key: 'individualTicketQuota', width: 14 },
          { header: 'تاریخ شروع قشموندی', key: 'qeshmondiStartDate', width: 20 },
          { header: 'تاریخ پایان قشموندی', key: 'qeshmondiEndDate', width: 20 },
          { header: 'استان', key: 'province', width: 18 },
          { header: 'شهر', key: 'city', width: 18 },
        ],
        rows: rows.map((row) => ({
          firstName: row.firstName,
          lastName: row.lastName,
          fatherName: row.fatherName ?? '',
          nationalId: row.nationalId ?? '',
          phone: row.phone ?? '',
          gender: qeshmondiGenderLabel(row.gender),
          birthDate: row.birthDate ?? '',
          occupation: row.occupation ?? '',
          isResident: row.isResident ? 'بله' : 'خیر',
          passportNumber: row.passportNumber ?? '',
          qeshmondiGroup: row.qeshmondiGroup ?? '',
          individualTicketQuota: row.individualTicketQuota,
          qeshmondiStartDate: row.qeshmondiStartDate ?? '',
          qeshmondiEndDate: row.qeshmondiEndDate ?? '',
          province: row.province ?? '',
          city: row.city ?? '',
        })),
      });
    }
    throw new BadRequestException('قالب فایل معتبر نیست');
  }

  private async loadQeshmondiBankRows() {
    const rows = await this.prisma.user.findMany({
      where: { isQeshmondi: true },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: qeshmondiProfileSelect,
    });
    return rows.map((row) => {
      const profile = mapQeshmondiProfile(row);
      return {
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: profile.fullName,
        fatherName: profile.fatherName,
        nationalId: profile.nationalId,
        phone: profile.phone,
        gender: profile.gender,
        birthDate: profile.birthDate,
        occupation: profile.occupation,
        isResident: profile.isResident,
        passportNumber: profile.passportNumber,
        qeshmondiGroup: profile.qeshmondiGroup,
        individualTicketQuota: profile.individualTicketQuota,
        qeshmondiStartDate: profile.qeshmondiStartDate,
        qeshmondiEndDate: profile.qeshmondiEndDate,
        province: profile.province ? localizedGeoName(profile.province) : null,
        city: profile.city ? localizedGeoName(profile.city) : null,
      };
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...userSelect, fingerprint: true },
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
        qeshmondiGroup: dto.qeshmondiGroup ?? null,
        latinFirstName: dto.latinFirstName ?? null,
        latinLastName: dto.latinLastName ?? null,
        latinFatherName: dto.latinFatherName ?? null,
        identityNumber: dto.identityNumber ?? null,
        identitySerial: dto.identitySerial ?? null,
        landlinePhone: dto.landlinePhone ?? null,
        fax: dto.fax ?? null,
        postalCode: dto.postalCode ?? null,
        jobAddress: dto.jobAddress ?? null,
        jobPhone: dto.jobPhone ?? null,
        jobFax: dto.jobFax ?? null,
        jobPostalCode: dto.jobPostalCode ?? null,
        isSingle: dto.isSingle ?? null,
        nationality: dto.nationality ?? null,
        education: dto.education ?? null,
        protectorOffice: dto.protectorOffice ?? null,
        nationalIdExpiresAt: parseOptionalIsoDate(dto.nationalIdExpiresAt) ?? null,
        passportExpiresAt: parseOptionalIsoDate(dto.passportExpiresAt) ?? null,
        bankFullName: dto.bankFullName ?? null,
        bankFullLatinName: dto.bankFullLatinName ?? null,
        accountNumber: dto.accountNumber ?? null,
        cardNumber: dto.cardNumber ?? null,
        cardSeries: dto.cardSeries ?? null,
        isBank: dto.isBank ?? null,
        accountOpeningDate: parseOptionalIsoDate(dto.accountOpeningDate) ?? null,
        cardIssuanceDate: parseOptionalIsoDate(dto.cardIssuanceDate) ?? null,
        cardDeliverDate: parseOptionalIsoDate(dto.cardDeliverDate) ?? null,
        companyName: dto.companyName ?? null,
        companySubject: dto.companySubject ?? null,
        companyLicenseNumber: dto.companyLicenseNumber ?? null,
        companyLicenseDate: parseOptionalIsoDate(dto.companyLicenseDate) ?? null,
        companyPaperNumber: dto.companyPaperNumber ?? null,
        companyPaperDate: parseOptionalIsoDate(dto.companyPaperDate) ?? null,
        electricitySubscription: dto.electricitySubscription ?? null,
        individualTicketQuota: dto.individualTicketQuota ?? 1,
        contractorId: await this.resolvePortalContractor(dto.roleIds, dto.contractorId),
      },
      select: userSelect,
    });
    await this.assignRolesOnCreate(user.id, dto.roleIds, dto.isQeshmondi);
    return this.findOne(user.id);
  }

  async beginQeshmondiImport(
    file?: { buffer?: Buffer; originalname?: string },
    actorId?: string,
  ) {
    this.assertQeshmondiSyncIdle();
    if (!file?.buffer?.length) {
      throw new BadRequestException('فایل اکسل را انتخاب کنید');
    }
    const name = file.originalname?.toLowerCase() ?? '';
    if (name && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      throw new BadRequestException('فقط فایل اکسل با پسوند xlsx مجاز است');
    }

    const jobId = randomUUID();
    const log = await openQeshmondiSyncLog(this.prisma, {
      source: QeshmondiSyncSource.FILE,
      actorId,
    });
    this.putQeshmondiJob({
      id: jobId,
      logId: log.id,
      phase: 'parsing',
      percent: 5,
      processed: 0,
      total: 0,
      updatedAt: Date.now(),
    });
    const buffer = Buffer.from(file.buffer);
    setImmediate(() => {
      void this.runQeshmondiImport(jobId, buffer);
    });
    return { jobId };
  }

  async beginQeshmondiSqlSync(settings: QeshmondiSqlSettings, actorId?: string) {
    this.assertQeshmondiSyncIdle();
    const jobId = randomUUID();
    const log = await openQeshmondiSyncLog(this.prisma, {
      source: QeshmondiSyncSource.DATABASE,
      actorId,
    });
    this.putQeshmondiJob({
      id: jobId,
      logId: log.id,
      phase: 'parsing',
      step: 'syncing',
      percent: 1,
      processed: 0,
      total: 0,
      updatedAt: Date.now(),
    });
    setImmediate(() => {
      void this.runQeshmondiSqlSync(jobId, settings);
    });
    return { jobId };
  }

  private assertQeshmondiSyncIdle() {
    for (const job of this.qeshmondiImportJobs.values()) {
      if (job.phase === 'parsing' || job.phase === 'saving') {
        throw new BadRequestException('یک به‌روزرسانی در حال اجراست');
      }
    }
  }

  async exportQeshmondiImport(jobId: string, kind: string) {
    this.pruneQeshmondiJobs();
    const job = this.qeshmondiImportJobs.get(jobId);
    if (!job || job.phase !== 'done') {
      throw new NotFoundException('وضعیت به‌روزرسانی یافت نشد');
    }
    if (kind === 'created') {
      return buildStyledExcelExport({
        sheetName: 'افراد جدید',
        fileName: 'افراد-جدید.xlsx',
        columns: [
          { header: 'نام', key: 'firstName', width: 18 },
          { header: 'نام خانوادگی', key: 'lastName', width: 22 },
          { header: 'نام پدر', key: 'fatherName', width: 18 },
          { header: 'کد ملی', key: 'nationalId', width: 16 },
          { header: 'تاریخ تولد', key: 'birthDate', width: 16 },
          { header: 'جنسیت', key: 'gender', width: 12 },
          { header: 'شماره گذرنامه', key: 'passportNumber', width: 18 },
          { header: 'شغل', key: 'occupation', width: 22 },
          { header: 'مقیم', key: 'isResident', width: 12 },
          { header: 'تاریخ پایان قشموندی', key: 'qeshmondiEndDate', width: 22 },
        ],
        rows: (job.createdRows ?? []).map((row) => ({
          firstName: row.firstName,
          lastName: row.lastName,
          fatherName: row.fatherName ?? '',
          nationalId: row.nationalId,
          birthDate: row.birthDate ?? '',
          gender: qeshmondiGenderLabel(row.gender),
          passportNumber: row.passportNumber ?? '',
          occupation: row.occupation ?? '',
          isResident: row.isResident ? 'بله' : 'خیر',
          qeshmondiEndDate: row.qeshmondiEndDate ?? '',
        })),
      });
    }
    if (kind === 'skipped') {
      return buildStyledExcelExport({
        sheetName: 'ردیف‌های نادیده',
        fileName: 'ردیف-های-نادیده.xlsx',
        columns: [
          { header: 'ردیف فایل', key: 'sourceRow', width: 14 },
          { header: 'دلیل', key: 'reason', width: 36 },
        ],
        rows: (job.skippedRows ?? []).map((row) => ({
          sourceRow: row.rowNumber,
          reason: row.reason,
        })),
      });
    }
    throw new BadRequestException('نوع خروجی نامعتبر است');
  }

  qeshmondiImportStatus(jobId: string) {
    this.pruneQeshmondiJobs();
    const job = this.qeshmondiImportJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('وضعیت به‌روزرسانی یافت نشد');
    }
    return {
      phase: job.phase,
      step: job.step ?? null,
      percent: job.percent,
      processed: job.processed,
      total: job.total,
      error: job.error ?? null,
      result: job.phase === 'done' ? (job.result ?? null) : null,
    };
  }

  private async runQeshmondiImport(jobId: string, buffer: Buffer) {
    try {
      let parsed;
      try {
        parsed = await parseQeshmondiExcel(buffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'خواندن فایل اکسل ممکن نبود';
        throw new BadRequestException(message);
      }

      const uniqueRows: QeshmondiImportRow[] = [];
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
        uniqueRows.push(row);
      }

      const total = uniqueRows.length;
      const result = {
        created: 0,
        updated: 0,
        skipped: parsed.skipped.length,
      };
      if (!total) {
        await this.completeQeshmondiImport(jobId, result, [], parsed.skipped, 0);
        return;
      }

      this.patchQeshmondiJob(jobId, {
        phase: 'saving',
        step: 'lookup',
        percent: 15,
        processed: 0,
        total,
      });

      let scanned = 0;
      const existingNationalIds = await this.findExistingNationalIds(
        uniqueRows.map((row) => row.nationalId),
        (count) => {
          scanned += count;
          const ratio = scanned / total;
          this.patchQeshmondiJob(jobId, {
            phase: 'saving',
            step: 'lookup',
            percent: 15 + Math.round(ratio * 15),
            processed: scanned,
            total,
          });
        },
      );
      const toUpdate: QeshmondiImportRow[] = [];
      const toCreate: QeshmondiImportRow[] = [];
      for (const row of uniqueRows) {
        if (existingNationalIds.has(row.nationalId)) toUpdate.push(row);
        else toCreate.push(row);
      }

      this.patchQeshmondiJob(jobId, {
        phase: 'saving',
        step: 'writing',
        percent: 30,
        processed: 0,
        total,
      });
      let written = 0;
      const reportWritten = (count: number) => {
        written += count;
        const ratio = written / total;
        this.patchQeshmondiJob(jobId, {
          phase: 'saving',
          step: 'writing',
          percent: Math.min(90, 30 + Math.round(ratio * 60)),
          processed: written,
          total,
        });
      };

      if (toUpdate.length) await this.bulkUpdateQeshmondiUsers(toUpdate, reportWritten);
      if (toCreate.length) {
        const passwordHash = await bcrypt.hash(QESHMONDI_IMPORT_PASSWORD, 10);
        await this.bulkCreateQeshmondiUsers(toCreate, passwordHash, reportWritten);
      }

      this.patchQeshmondiJob(jobId, {
        phase: 'saving',
        step: 'roles',
        percent: 90,
        processed: 0,
        total,
      });
      let assigned = 0;
      const citizen = await ensureCitizenRole(this.prisma);
      await this.assignCitizenRoleForNationalIds(
        uniqueRows.map((row) => row.nationalId),
        citizen.id,
        (count) => {
          assigned += count;
          const ratio = assigned / total;
          this.patchQeshmondiJob(jobId, {
            phase: 'saving',
            step: 'roles',
            percent: Math.min(99, 90 + Math.round(ratio * 9)),
            processed: assigned,
            total,
          });
        },
      );

      result.created = toCreate.length;
      result.updated = toUpdate.length;
      await this.completeQeshmondiImport(jobId, result, toCreate, parsed.skipped, total);
    } catch (error) {
      await this.failQeshmondiImport(jobId, error);
    }
  }

  private async completeQeshmondiImport(
    jobId: string,
    result: QeshmondiImportResult,
    createdRows: QeshmondiImportRow[],
    skippedRows: QeshmondiImportSkip[],
    total: number,
  ) {
    const logId = this.qeshmondiImportJobs.get(jobId)?.logId;
    if (logId) {
      await finishQeshmondiSyncLog(this.prisma, logId, {
        status: QeshmondiSyncStatus.DONE,
        createdCount: result.created,
        updatedCount: result.updated,
        failedCount: result.skipped,
      });
    }
    this.patchQeshmondiJob(jobId, {
      phase: 'done',
      percent: 100,
      processed: total,
      total,
      result,
      createdRows,
      skippedRows,
    });
  }

  private async failQeshmondiImport(
    jobId: string,
    error: unknown,
    counts?: QeshmondiImportResult,
  ) {
    const message = qeshmondiImportErrorText(error);
    const logId = this.qeshmondiImportJobs.get(jobId)?.logId;
    this.patchQeshmondiJob(jobId, {
      phase: 'error',
      error: message,
    });
    if (!logId) return;
    await finishQeshmondiSyncLog(this.prisma, logId, {
      status: QeshmondiSyncStatus.FAILED,
      createdCount: counts?.created ?? 0,
      updatedCount: counts?.updated ?? 0,
      failedCount: counts?.skipped ?? 0,
      errorMessage: message,
    });
  }

  private async runQeshmondiSqlSync(jobId: string, settings: QeshmondiSqlSettings) {
    const counts: QeshmondiImportResult = { created: 0, updated: 0, skipped: 0 };
    let sourceTotal = 0;
    try {
      let passwordHash: string | null = null;
      const citizen = await ensureCitizenRole(this.prisma);
      const lookups = await ensureQeshmondiLookups(this.prisma);
      await streamQeshmondiSqlPeople(settings, lookups, async ({ rows, skipped, read, total }) => {
        sourceTotal = total;
        counts.skipped += skipped.length;
        if (rows.length) {
          const existing = await this.findExistingNationalIds(rows.map((row) => row.nationalId));
          const toUpdate: QeshmondiImportRow[] = [];
          const toCreate: QeshmondiImportRow[] = [];
          for (const row of rows) {
            if (existing.has(row.nationalId)) toUpdate.push(row);
            else toCreate.push(row);
          }
          if (toUpdate.length) await this.bulkUpdateQeshmondiSqlUsers(toUpdate);
          if (toCreate.length) {
            if (!passwordHash) passwordHash = await bcrypt.hash(QESHMONDI_IMPORT_PASSWORD, 10);
            await this.bulkCreateQeshmondiUsers(toCreate, passwordHash);
          }
          await this.assignCitizenRoleForNationalIds(
            rows.map((row) => row.nationalId),
            citizen.id,
          );
          counts.created += toCreate.length;
          counts.updated += toUpdate.length;
        }
        const percent = total > 0 ? Math.min(99, Math.round((read / total) * 100)) : 0;
        this.patchQeshmondiJob(jobId, {
          phase: 'saving',
          step: 'syncing',
          percent,
          processed: read,
          total,
        });
      });
      await this.completeQeshmondiImport(jobId, counts, [], [], sourceTotal);
    } catch (error) {
      await this.failQeshmondiImport(jobId, new Error(qeshmondiSqlErrorText(error)), counts);
    }
  }

  private async findExistingNationalIds(
    nationalIds: string[],
    onChunk?: (count: number) => void,
  ) {
    const found = new Set<string>();
    for (const chunk of chunkList(nationalIds, QESHMONDI_LOOKUP_CHUNK)) {
      const rows = await this.prisma.user.findMany({
        where: { nationalId: { in: chunk } },
        select: { nationalId: true },
      });
      for (const row of rows) {
        if (row.nationalId) found.add(row.nationalId);
      }
      onChunk?.(chunk.length);
    }
    return found;
  }

  private async bulkUpdateQeshmondiUsers(
    rows: QeshmondiImportRow[],
    onChunk?: (count: number) => void,
  ) {
    for (const chunk of chunkList(rows, QESHMONDI_WRITE_CHUNK)) {
      const payload = JSON.stringify(
        chunk.map((row) => ({
          national_id: row.nationalId,
          first_name: row.firstName,
          last_name: row.lastName,
          full_name: joinFullName(row.firstName, row.lastName),
          father_name: row.fatherName,
          birth_date: row.birthDate,
          gender: row.gender,
          passport_number: row.passportNumber,
          occupation: row.occupation,
          is_resident: row.isResident,
          end_date: row.qeshmondiEndDate,
        })),
      );
      const updatedAt = new Date();
      await this.prisma.$executeRaw`
        UPDATE "users" AS u SET
          "firstName" = v.first_name,
          "lastName" = v.last_name,
          "fullName" = v.full_name,
          "fatherName" = v.father_name,
          "birthDate" = CAST(v.birth_date AS date),
          "gender" = CAST(v.gender AS "UserGender"),
          "passportNumber" = v.passport_number,
          "occupation" = v.occupation,
          "isResident" = v.is_resident,
          "qeshmondiEndDate" = CAST(v.end_date AS date),
          "isQeshmondi" = true,
          "updatedAt" = ${updatedAt}
        FROM jsonb_to_recordset(CAST(${payload} AS jsonb)) AS v(
          national_id text,
          first_name text,
          last_name text,
          full_name text,
          father_name text,
          birth_date text,
          gender text,
          passport_number text,
          occupation text,
          is_resident boolean,
          end_date text
        )
        WHERE u."nationalId" = v.national_id
      `;
      onChunk?.(chunk.length);
    }
  }

  /** SQL sync writes tblPerson columns. An empty source value keeps the current user value. */
  private async bulkUpdateQeshmondiSqlUsers(rows: QeshmondiImportRow[]) {
    for (const chunk of chunkList(rows, QESHMONDI_SQL_WRITE_CHUNK)) {
      const payload = JSON.stringify(
        chunk.map((row) => ({
          national_id: row.nationalId,
          first_name: row.firstName,
          last_name: row.lastName,
          full_name: joinFullName(row.firstName, row.lastName),
          father_name: blank(row.fatherName),
          birth_date: blank(row.birthDate),
          gender: row.gender ?? '',
          passport_number: blank(row.passportNumber),
          occupation: blank(row.occupation),
          is_resident: row.isResident,
          end_date: blank(row.qeshmondiEndDate),
          ...citizenSqlPayload(row),
        })),
      );
      const updatedAt = new Date();
      await this.prisma.$executeRaw`
        UPDATE "users" AS u SET
          "firstName" = v.first_name,
          "lastName" = v.last_name,
          "fullName" = v.full_name,
          "fatherName" = COALESCE(NULLIF(v.father_name, ''), u."fatherName"),
          "birthDate" = COALESCE(CAST(NULLIF(v.birth_date, '') AS date), u."birthDate"),
          "gender" = CASE
            WHEN v.gender IS NULL OR v.gender = '' THEN u."gender"
            ELSE CAST(v.gender AS "UserGender")
          END,
          "passportNumber" = COALESCE(NULLIF(v.passport_number, ''), u."passportNumber"),
          "occupation" = COALESCE(NULLIF(v.occupation, ''), u."occupation"),
          "isResident" = v.is_resident,
          "qeshmondiEndDate" = COALESCE(CAST(NULLIF(v.end_date, '') AS date), u."qeshmondiEndDate"),
          "qeshmondiGroup" = COALESCE(NULLIF(v.group_name, ''), u."qeshmondiGroup"),
          "latinFirstName" = COALESCE(NULLIF(v.latin_first_name, ''), u."latinFirstName"),
          "latinLastName" = COALESCE(NULLIF(v.latin_last_name, ''), u."latinLastName"),
          "latinFatherName" = COALESCE(NULLIF(v.latin_father_name, ''), u."latinFatherName"),
          "identityNumber" = COALESCE(NULLIF(v.identity_number, ''), u."identityNumber"),
          "identitySerial" = COALESCE(NULLIF(v.identity_serial, ''), u."identitySerial"),
          "landlinePhone" = COALESCE(NULLIF(v.landline_phone, ''), u."landlinePhone"),
          "fax" = COALESCE(NULLIF(v.fax, ''), u."fax"),
          "postalCode" = COALESCE(NULLIF(v.postal_code, ''), u."postalCode"),
          "jobAddress" = COALESCE(NULLIF(v.job_address, ''), u."jobAddress"),
          "jobPhone" = COALESCE(NULLIF(v.job_phone, ''), u."jobPhone"),
          "jobFax" = COALESCE(NULLIF(v.job_fax, ''), u."jobFax"),
          "jobPostalCode" = COALESCE(NULLIF(v.job_postal_code, ''), u."jobPostalCode"),
          "isSingle" = CASE WHEN v.is_single IS NULL THEN u."isSingle" ELSE v.is_single END,
          "nationality" = COALESCE(NULLIF(v.nationality, ''), u."nationality"),
          "education" = COALESCE(NULLIF(v.education, ''), u."education"),
          "protectorOffice" = COALESCE(NULLIF(v.protector_office, ''), u."protectorOffice"),
          "religion" = CASE
            WHEN v.religion IS NULL OR v.religion = '' THEN u."religion"
            ELSE CAST(v.religion AS "Religion")
          END,
          "religionOther" = CASE
            WHEN v.religion IS NULL OR v.religion = '' THEN u."religionOther"
            ELSE NULLIF(v.religion_other, '')
          END,
          "nationalIdExpiresAt" = COALESCE(CAST(NULLIF(v.national_id_expires, '') AS date), u."nationalIdExpiresAt"),
          "passportExpiresAt" = COALESCE(CAST(NULLIF(v.passport_expires, '') AS date), u."passportExpiresAt"),
          "bankFullName" = COALESCE(NULLIF(v.bank_full_name, ''), u."bankFullName"),
          "bankFullLatinName" = COALESCE(NULLIF(v.bank_full_latin_name, ''), u."bankFullLatinName"),
          "accountNumber" = COALESCE(NULLIF(v.account_number, ''), u."accountNumber"),
          "cardNumber" = COALESCE(NULLIF(v.card_number, ''), u."cardNumber"),
          "cardSeries" = COALESCE(NULLIF(v.card_series, ''), u."cardSeries"),
          "isBank" = CASE WHEN v.is_bank IS NULL THEN u."isBank" ELSE v.is_bank END,
          "accountOpeningDate" = COALESCE(CAST(NULLIF(v.account_opening_date, '') AS date), u."accountOpeningDate"),
          "cardIssuanceDate" = COALESCE(CAST(NULLIF(v.card_issuance_date, '') AS date), u."cardIssuanceDate"),
          "cardDeliverDate" = COALESCE(CAST(NULLIF(v.card_deliver_date, '') AS date), u."cardDeliverDate"),
          "companyName" = COALESCE(NULLIF(v.company_name, ''), u."companyName"),
          "companySubject" = COALESCE(NULLIF(v.company_subject, ''), u."companySubject"),
          "companyLicenseNumber" = COALESCE(NULLIF(v.company_license_number, ''), u."companyLicenseNumber"),
          "companyLicenseDate" = COALESCE(CAST(NULLIF(v.company_license_date, '') AS date), u."companyLicenseDate"),
          "companyPaperNumber" = COALESCE(NULLIF(v.company_paper_number, ''), u."companyPaperNumber"),
          "companyPaperDate" = COALESCE(CAST(NULLIF(v.company_paper_date, '') AS date), u."companyPaperDate"),
          "electricitySubscription" = COALESCE(NULLIF(v.electricity_subscription, ''), u."electricitySubscription"),
          "isQeshmondi" = true,
          "updatedAt" = ${updatedAt}
        FROM jsonb_to_recordset(CAST(${payload} AS jsonb)) AS v(
          national_id text,
          first_name text,
          last_name text,
          full_name text,
          father_name text,
          birth_date text,
          gender text,
          passport_number text,
          occupation text,
          is_resident boolean,
          end_date text,
          group_name text,
          latin_first_name text,
          latin_last_name text,
          latin_father_name text,
          identity_number text,
          identity_serial text,
          landline_phone text,
          fax text,
          postal_code text,
          job_address text,
          job_phone text,
          job_fax text,
          job_postal_code text,
          is_single boolean,
          nationality text,
          education text,
          protector_office text,
          religion text,
          religion_other text,
          national_id_expires text,
          passport_expires text,
          bank_full_name text,
          bank_full_latin_name text,
          account_number text,
          card_number text,
          card_series text,
          is_bank boolean,
          account_opening_date text,
          card_issuance_date text,
          card_deliver_date text,
          company_name text,
          company_subject text,
          company_license_number text,
          company_license_date text,
          company_paper_number text,
          company_paper_date text,
          electricity_subscription text
        )
        WHERE u."nationalId" = v.national_id
      `;
    }
    await this.bulkUpdateQeshmondiFingerprints(rows);
  }

  private async bulkUpdateQeshmondiFingerprints(rows: QeshmondiImportRow[]) {
    const withPrint = rows.filter((row) => row.citizen?.fingerprintBase64);
    for (const chunk of chunkList(withPrint, 40)) {
      const payload = JSON.stringify(
        chunk.map((row) => ({
          national_id: row.nationalId,
          fingerprint_b64: row.citizen?.fingerprintBase64 ?? '',
        })),
      );
      const updatedAt = new Date();
      await this.prisma.$executeRaw`
        UPDATE "users" AS u SET
          "fingerprint" = decode(v.fingerprint_b64, 'base64'),
          "updatedAt" = ${updatedAt}
        FROM jsonb_to_recordset(CAST(${payload} AS jsonb)) AS v(
          national_id text,
          fingerprint_b64 text
        )
        WHERE u."nationalId" = v.national_id
          AND v.fingerprint_b64 <> ''
      `;
    }
  }

  private async bulkCreateQeshmondiUsers(
    rows: QeshmondiImportRow[],
    passwordHash: string,
    onChunk?: (count: number) => void,
  ) {
    const takenUsernames = new Set<string>();
    for (const chunk of chunkList(
      rows.map((row) => row.nationalId),
      QESHMONDI_LOOKUP_CHUNK,
    )) {
      const existing = await this.prisma.user.findMany({
        where: { username: { in: chunk } },
        select: { username: true },
      });
      for (const item of existing) takenUsernames.add(item.username);
    }

    const stamp = Date.now().toString(36);
    let collision = 0;
    const data = rows.map((row) => {
      let username = row.nationalId;
      if (takenUsernames.has(username)) {
        collision += 1;
        username = `${row.nationalId}-${stamp}-${collision}`;
      }
      return {
        username,
        passwordHash,
        locale: 'fa',
        status: UserStatus.ACTIVE,
        nationalId: row.nationalId,
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
        ...citizenCreateData(row),
      };
    });

    for (const chunk of chunkList(data, QESHMONDI_WRITE_CHUNK)) {
      await this.prisma.user.createMany({ data: chunk });
      onChunk?.(chunk.length);
    }
    await this.bulkUpdateQeshmondiFingerprints(rows);
  }

  private async assignCitizenRoleForNationalIds(
    nationalIds: string[],
    roleId: string,
    onChunk?: (count: number) => void,
  ) {
    for (const chunk of chunkList(nationalIds, QESHMONDI_LOOKUP_CHUNK)) {
      await this.prisma.$executeRaw`
        INSERT INTO "user_roles" ("userId", "roleId")
        SELECT u.id, ${roleId}
        FROM "users" u
        WHERE u."nationalId" IN (${Prisma.join(chunk)})
        ON CONFLICT ("userId", "roleId") DO NOTHING
      `;
      onChunk?.(chunk.length);
    }
  }

  private putQeshmondiJob(job: QeshmondiImportJob) {
    this.pruneQeshmondiJobs();
    this.qeshmondiImportJobs.set(job.id, job);
  }

  private patchQeshmondiJob(id: string, patch: Partial<QeshmondiImportJob>) {
    const current = this.qeshmondiImportJobs.get(id);
    if (!current || current.phase === 'done' || current.phase === 'error') return;
    this.qeshmondiImportJobs.set(id, { ...current, ...patch, updatedAt: Date.now() });
  }

  private pruneQeshmondiJobs() {
    const cutoff = Date.now() - QESHMONDI_IMPORT_JOB_TTL_MS;
    for (const [id, job] of this.qeshmondiImportJobs) {
      if (job.updatedAt < cutoff) this.qeshmondiImportJobs.delete(id);
    }
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
      qeshmondiGroup: dto.qeshmondiGroup === undefined ? undefined : dto.qeshmondiGroup,
      latinFirstName: dto.latinFirstName === undefined ? undefined : dto.latinFirstName,
      latinLastName: dto.latinLastName === undefined ? undefined : dto.latinLastName,
      latinFatherName: dto.latinFatherName === undefined ? undefined : dto.latinFatherName,
      identityNumber: dto.identityNumber === undefined ? undefined : dto.identityNumber,
      identitySerial: dto.identitySerial === undefined ? undefined : dto.identitySerial,
      landlinePhone: dto.landlinePhone === undefined ? undefined : dto.landlinePhone,
      fax: dto.fax === undefined ? undefined : dto.fax,
      postalCode: dto.postalCode === undefined ? undefined : dto.postalCode,
      jobAddress: dto.jobAddress === undefined ? undefined : dto.jobAddress,
      jobPhone: dto.jobPhone === undefined ? undefined : dto.jobPhone,
      jobFax: dto.jobFax === undefined ? undefined : dto.jobFax,
      jobPostalCode: dto.jobPostalCode === undefined ? undefined : dto.jobPostalCode,
      isSingle: dto.isSingle,
      nationality: dto.nationality === undefined ? undefined : dto.nationality,
      education: dto.education === undefined ? undefined : dto.education,
      protectorOffice: dto.protectorOffice === undefined ? undefined : dto.protectorOffice,
      nationalIdExpiresAt:
        dto.nationalIdExpiresAt === undefined
          ? undefined
          : parseOptionalIsoDate(dto.nationalIdExpiresAt),
      passportExpiresAt:
        dto.passportExpiresAt === undefined
          ? undefined
          : parseOptionalIsoDate(dto.passportExpiresAt),
      bankFullName: dto.bankFullName === undefined ? undefined : dto.bankFullName,
      bankFullLatinName: dto.bankFullLatinName === undefined ? undefined : dto.bankFullLatinName,
      accountNumber: dto.accountNumber === undefined ? undefined : dto.accountNumber,
      cardNumber: dto.cardNumber === undefined ? undefined : dto.cardNumber,
      cardSeries: dto.cardSeries === undefined ? undefined : dto.cardSeries,
      isBank: dto.isBank,
      accountOpeningDate:
        dto.accountOpeningDate === undefined
          ? undefined
          : parseOptionalIsoDate(dto.accountOpeningDate),
      cardIssuanceDate:
        dto.cardIssuanceDate === undefined
          ? undefined
          : parseOptionalIsoDate(dto.cardIssuanceDate),
      cardDeliverDate:
        dto.cardDeliverDate === undefined ? undefined : parseOptionalIsoDate(dto.cardDeliverDate),
      companyName: dto.companyName === undefined ? undefined : dto.companyName,
      companySubject: dto.companySubject === undefined ? undefined : dto.companySubject,
      companyLicenseNumber:
        dto.companyLicenseNumber === undefined ? undefined : dto.companyLicenseNumber,
      companyLicenseDate:
        dto.companyLicenseDate === undefined
          ? undefined
          : parseOptionalIsoDate(dto.companyLicenseDate),
      companyPaperNumber: dto.companyPaperNumber === undefined ? undefined : dto.companyPaperNumber,
      companyPaperDate:
        dto.companyPaperDate === undefined ? undefined : parseOptionalIsoDate(dto.companyPaperDate),
      electricitySubscription:
        dto.electricitySubscription === undefined ? undefined : dto.electricitySubscription,
      individualTicketQuota:
        dto.individualTicketQuota === undefined ? undefined : dto.individualTicketQuota,
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
    const ticketQuotaBefore =
      dto.individualTicketQuota !== undefined || dto.nationalId !== undefined
        ? await this.prisma.user.findUnique({
            where: { id },
            select: { nationalId: true, individualTicketQuota: true },
          })
        : null;
    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });
    if (ticketQuotaBefore) {
      await this.invalidatePortTicketQuotas(ticketQuotaBefore, user);
    }
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
      individualTicketQuota: _individualTicketQuota,
      ...rest
    } = dto;
    return this.update(id, rest);
  }

  /** با تغییر سهمیهٔ بلیط یا کد ملی، اسنپ‌شات سهمیهٔ گزارش‌های شامل این شخص کهنه می‌شود. محاسبهٔ دوباره فقط با دکمهٔ بررسی همان گزارش است. */
  private async invalidatePortTicketQuotas(
    before: { nationalId: string | null; individualTicketQuota: number },
    after: { nationalId: string | null; individualTicketQuota: number },
  ) {
    const nationalIdChanged = before.nationalId !== after.nationalId;
    if (!nationalIdChanged && before.individualTicketQuota === after.individualTicketQuota) {
      return;
    }
    const nationalIds = [
      ...new Set([before.nationalId, after.nationalId].filter((value): value is string => Boolean(value))),
    ];
    if (!nationalIds.length) return;
    await this.prisma.portSalesReport.updateMany({
      where: {
        quotaSnapshotReady: true,
        tickets: { some: { nationalId: { in: nationalIds } } },
      },
      data: { quotaSnapshotReady: false },
    });
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

function qeshmondiImportErrorText(error: unknown) {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string' && body.trim()) return body;
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
      if (Array.isArray(message)) {
        const text = message.filter((item) => typeof item === 'string').join('، ');
        if (text) return text;
      }
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'به‌روزرسانی اطلاعات انجام نشد';
}

function mapQeshmondiProfile<
  T extends {
    birthDate: Date | null;
    qeshmondiStartDate: Date | null;
    qeshmondiEndDate: Date | null;
  },
>(row: T) {
  return {
    ...row,
    birthDate: toIsoDateOnly(row.birthDate),
    qeshmondiStartDate: toIsoDateOnly(row.qeshmondiStartDate),
    qeshmondiEndDate: toIsoDateOnly(row.qeshmondiEndDate),
  };
}

function qeshmondiGenderLabel(gender: UserGender | null) {
  if (gender === UserGender.MALE) return 'مرد';
  if (gender === UserGender.FEMALE) return 'زن';
  return '';
}

function chunkList<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
