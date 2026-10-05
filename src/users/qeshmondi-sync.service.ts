import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { containsInsensitive, paginatedResult, paginationArgs } from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';
import { FindQeshmondiSyncLogsQueryDto } from './dto/find-qeshmondi-sync-logs-query.dto';
import { SaveQeshmondiSqlConnectionDto } from './dto/save-qeshmondi-sql-connection.dto';
import { decryptQeshmondiSecret, encryptQeshmondiSecret } from './qeshmondi-secret';
import {
  QESHMONDI_SQL_CONNECTION_ID,
  qeshmondiSqlErrorText,
  testQeshmondiSqlConnection,
} from './qeshmondi-sql';

const connectionSelect = {
  host: true,
  port: true,
  databaseName: true,
  username: true,
  passwordCipher: true,
  encrypt: true,
  trustServerCertificate: true,
  updatedAt: true,
} as const;

@Injectable()
export class QeshmondiSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async getConnection() {
    const row = await this.prisma.qeshmondiSqlConnection.findUnique({
      where: { id: QESHMONDI_SQL_CONNECTION_ID },
      select: connectionSelect,
    });
    if (!row) {
      return {
        configured: false,
        host: '',
        port: 1433,
        databaseName: '',
        username: '',
        encrypt: true,
        trustServerCertificate: true,
        passwordSet: false,
        updatedAt: null,
      };
    }
    return this.toPublic(row);
  }

  async saveConnection(dto: SaveQeshmondiSqlConnectionDto, actorId?: string) {
    const host = dto.host.trim();
    const databaseName = dto.databaseName.trim();
    const username = dto.username.trim();
    if (!host || !databaseName || !username) {
      throw new BadRequestException('سرور، نام پایگاه و نام کاربری را وارد کنید');
    }

    const current = await this.prisma.qeshmondiSqlConnection.findUnique({
      where: { id: QESHMONDI_SQL_CONNECTION_ID },
      select: { passwordCipher: true },
    });
    const password = dto.password?.trim();
    if (!password && !current?.passwordCipher) {
      throw new BadRequestException('رمز عبور پایگاه را وارد کنید');
    }

    const row = await this.prisma.qeshmondiSqlConnection.upsert({
      where: { id: QESHMONDI_SQL_CONNECTION_ID },
      create: {
        id: QESHMONDI_SQL_CONNECTION_ID,
        host,
        port: dto.port,
        databaseName,
        username,
        passwordCipher: encryptQeshmondiSecret(password ?? ''),
        encrypt: dto.encrypt,
        trustServerCertificate: dto.trustServerCertificate,
        updatedById: actorId || null,
      },
      update: {
        host,
        port: dto.port,
        databaseName,
        username,
        ...(password ? { passwordCipher: encryptQeshmondiSecret(password) } : {}),
        encrypt: dto.encrypt,
        trustServerCertificate: dto.trustServerCertificate,
        updatedById: actorId || null,
      },
      select: connectionSelect,
    });
    return this.toPublic(row);
  }

  async testConnection() {
    const settings = await this.savedSettings();
    try {
      await testQeshmondiSqlConnection(settings);
    } catch (error) {
      throw new BadRequestException(qeshmondiSqlErrorText(error));
    }
    return { ok: true as const };
  }

  async beginDatabaseSync(actorId?: string) {
    const settings = await this.savedSettings();
    return this.users.beginQeshmondiSqlSync(settings, actorId);
  }

  async findLogs(query: FindQeshmondiSyncLogsQueryDto) {
    const { page, pageSize, skip, take } = paginationArgs(query);
    const q = query.q?.trim();
    const where: Prisma.QeshmondiSyncLogWhereInput = {
      ...(query.source ? { source: query.source } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { actor: { fullName: containsInsensitive(q) } },
              { actor: { firstName: containsInsensitive(q) } },
              { actor: { lastName: containsInsensitive(q) } },
            ],
          }
        : {}),
    };
    const orderBy = resolveSortOrder<Prisma.QeshmondiSyncLogOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        startedAt: (dir) => ({ startedAt: dir }),
        finishedAt: (dir) => ({ finishedAt: dir }),
        source: (dir) => ({ source: dir }),
        status: (dir) => ({ status: dir }),
        createdCount: (dir) => ({ createdCount: dir }),
        updatedCount: (dir) => ({ updatedCount: dir }),
        failedCount: (dir) => ({ failedCount: dir }),
        actor: (dir) => ({ actor: { fullName: dir } }),
      },
      [{ startedAt: 'desc' }, { id: 'asc' }],
    );
    const [items, total] = await Promise.all([
      this.prisma.qeshmondiSyncLog.findMany({
        where,
        orderBy,
        skip,
        take,
        select: logSelect,
      }),
      this.prisma.qeshmondiSyncLog.count({ where }),
    ]);
    return paginatedResult(items.map((item) => this.toLog(item)), total, page, pageSize);
  }

  async findLog(id: string) {
    const row = await this.prisma.qeshmondiSyncLog.findUnique({
      where: { id },
      select: logSelect,
    });
    if (!row) throw new NotFoundException('گزارش به‌روزرسانی یافت نشد');
    return this.toLog(row);
  }

  private async savedSettings() {
    const row = await this.prisma.qeshmondiSqlConnection.findUnique({
      where: { id: QESHMONDI_SQL_CONNECTION_ID },
      select: connectionSelect,
    });
    if (!row) {
      throw new BadRequestException('ابتدا اتصال پایگاه را ذخیره کنید');
    }
    let password = '';
    try {
      password = decryptQeshmondiSecret(row.passwordCipher);
    } catch {
      throw new BadRequestException('رمز ذخیره‌شده قابل خواندن نیست. رمز را دوباره ذخیره کنید');
    }
    return {
      host: row.host,
      port: row.port,
      databaseName: row.databaseName,
      username: row.username,
      password,
      encrypt: row.encrypt,
      trustServerCertificate: row.trustServerCertificate,
    };
  }

  private toPublic(row: {
    host: string;
    port: number;
    databaseName: string;
    username: string;
    passwordCipher: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
    updatedAt: Date;
  }) {
    return {
      configured: true,
      host: row.host,
      port: row.port,
      databaseName: row.databaseName,
      username: row.username,
      encrypt: row.encrypt,
      trustServerCertificate: row.trustServerCertificate,
      passwordSet: Boolean(row.passwordCipher),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toLog(row: {
    id: string;
    source: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    createdCount: number;
    updatedCount: number;
    failedCount: number;
    errorMessage: string | null;
    actor: { id: string; fullName: string } | null;
  }) {
    return {
      id: row.id,
      source: row.source,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      createdCount: row.createdCount,
      updatedCount: row.updatedCount,
      failedCount: row.failedCount,
      errorMessage: row.errorMessage,
      actor: row.actor ? { id: row.actor.id, fullName: row.actor.fullName } : null,
    };
  }
}

const logSelect = {
  id: true,
  source: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  createdCount: true,
  updatedCount: true,
  failedCount: true,
  errorMessage: true,
  actor: { select: { id: true, fullName: true } },
} as const;
