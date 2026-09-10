import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { loadUserAccess } from '../access/access.util';
import { normalizeNationalId, toLatinDigits } from '../common/national-id';
import { phoneLookupValues } from '../common/phone';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { joinFullName, splitFullName } from '../users/user-profile.util';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

const IMPERSONATE_TOKEN_TTL = '2h';

const userSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  fullName: true,
  locale: true,
  status: true,
  nationalId: true,
  phone: true,
  countryId: true,
  provinceId: true,
  cityId: true,
  photoId: true,
  orgUnitId: true,
  orgUnit: { select: { id: true, name: true, nutritionRepId: true } },
} as const;

type ProfileExtras = {
  impersonating?: boolean;
  impersonatedBy?: { id: string; fullName: string } | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const identifier = toLatinDigits(dto.username.trim());
    const password = toLatinDigits(dto.password);
    const nationalId = normalizeNationalId(identifier);
    const or: Prisma.UserWhereInput[] = [{ username: identifier }];
    if (nationalId) {
      or.push({ nationalId });
    }
    for (const phone of phoneLookupValues(identifier)) {
      or.push({ phone });
    }
    const user = await this.prisma.user.findFirst({
      where: { OR: or },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است');
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است');
    }

    if (dto.locale && dto.locale !== user.locale) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { locale: dto.locale },
      });
    }

    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: userSelect,
    });

    const token = await this.jwt.signAsync({ sub: profile.id });
    return { token, user: await this.toProfile(profile) };
  }

  async profile(userId: string, impersonatedById?: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toProfile(
      user,
      await this.impersonationExtras(impersonatedById),
    );
  }

  async impersonate(
    actorId: string,
    targetUserId: string,
    alreadyImpersonating: boolean,
  ) {
    if (alreadyImpersonating) {
      throw new ForbiddenException(
        'در حالت مشاهده پنل کاربر نمی‌توان دوباره وارد شد',
      );
    }
    if (!actorId) {
      throw new UnauthorizedException();
    }

    const actorAccess = await loadUserAccess(this.prisma, actorId);
    if (!actorAccess.isAdmin) {
      throw new ForbiddenException('فقط نقش مدیریت می‌تواند وارد پنل کاربر شود');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: userSelect,
    });
    if (!target) {
      throw new NotFoundException('کاربر یافت نشد');
    }
    if (target.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('ورود به پنل کاربر غیرفعال ممکن نیست');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, fullName: true },
    });

    this.logger.log(`User ${actorId} opened panel as ${target.id}`);

    const token = await this.jwt.signAsync(
      {
        sub: target.id,
        act: actorId,
        impersonating: true,
      },
      { expiresIn: IMPERSONATE_TOKEN_TTL },
    );

    return {
      token,
      user: await this.toProfile(target, {
        impersonating: true,
        impersonatedBy: actor,
      }),
    };
  }

  assertNotImpersonating(impersonating: boolean) {
    if (impersonating) {
      throw new ForbiddenException(
        'این عملیات در حالت مشاهده پنل کاربر مجاز نیست',
      );
    }
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    impersonating = false,
  ) {
    this.assertNotImpersonating(impersonating);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('رمز عبور فعلی نادرست است');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    return { ok: true };
  }

  async updateSettings(
    userId: string,
    fullName?: string,
    locale?: string,
    impersonating = false,
  ) {
    this.assertNotImpersonating(impersonating);
    const names = fullName ? splitFullName(fullName) : undefined;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(names
          ? {
              firstName: names.firstName,
              lastName: names.lastName,
              fullName: joinFullName(names.firstName, names.lastName),
            }
          : {}),
        ...(locale ? { locale } : {}),
      },
      select: userSelect,
    });
    return this.toProfile(user);
  }

  private async impersonationExtras(
    impersonatedById?: string | null,
  ): Promise<ProfileExtras | undefined> {
    if (!impersonatedById) return undefined;
    const actor = await this.prisma.user.findUnique({
      where: { id: impersonatedById },
      select: { id: true, fullName: true },
    });
    return { impersonating: true, impersonatedBy: actor };
  }

  private async toProfile(
    user: {
      id: string;
      username: string;
      firstName: string;
      lastName: string;
      fullName: string;
      locale: string;
      status: UserStatus;
      nationalId?: string | null;
      phone?: string | null;
      countryId?: string | null;
      provinceId?: string | null;
      cityId?: string | null;
      photoId?: string | null;
      orgUnitId?: string | null;
      orgUnit?: { id: string; name: string; nutritionRepId: string | null } | null;
    },
    extras?: ProfileExtras,
  ) {
    const { orgUnit, ...rest } = user;
    const access = await loadUserAccess(this.prisma, user.id);
    const roles = await this.prisma.role.findMany({
      where: { users: { some: { userId: user.id } } },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });
    return {
      ...rest,
      orgUnit: orgUnit ? { id: orgUnit.id, name: orgUnit.name } : null,
      isNutritionRep: Boolean(orgUnit && orgUnit.nutritionRepId === user.id),
      roles,
      isAdmin: access.isAdmin,
      permissionCodes: access.permissionCodes,
      modules: [],
      ...extras,
    };
  }
}
