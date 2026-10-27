import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeMobile } from '../common/phone';

export type SendSmsInput = {
  phone: string;
  body: string;
};

export type SendSmsResult = {
  skipped: boolean;
  message?: string;
  recId?: string;
};

type FarapayamakResponse = {
  Value?: string | number | null;
  RetStatus?: number | string | null;
  StrRetStatus?: string | null;
};

const DEFAULT_BASE_URL = 'https://rest.payamak-panel.com';
const SEND_PATH = '/api/SendSMS/SendSMS';
const REQUEST_TIMEOUT_MS = 20_000;
const SUCCESS_RET_STATUS = 1;

const VALUE_ERRORS: Record<string, string> = {
  '-112': 'دسترسی وب‌سرویس برای حساب پیامک غیرفعال است',
  '-111': 'IP درخواست‌کننده برای سامانه پیامک مجاز نیست',
  '-110': 'برای وب‌سرویس باید از کلید API به‌جای رمز عبور استفاده شود',
  '-109': 'تنظیم IP مجاز برای استفاده از API الزامی است',
  '-108': 'IP به‌دلیل تلاش ناموفق استفاده از API مسدود شده است',
  '-100': 'خطای داخلی سامانه پیامک یا پارامتر نامعتبر',
  '0': 'نام کاربری یا کلید API سامانه پیامک صحیح نیست',
  '2': 'اعتبار حساب پیامک کافی نیست',
  '3': 'محدودیت ارسال روزانه پیامک تکمیل شده است',
  '4': 'محدودیت حجم ارسال پیامک رعایت نشده است',
  '5': 'شماره فرستنده پیامک معتبر نیست',
  '6': 'ارسال از این خط مجاز نیست یا سامانه پیامک در حال به‌روزرسانی است',
  '7': 'متن پیامک حاوی کلمه فیلترشده است',
  '9': 'ارسال از خطوط عمومی از طریق وب‌سرویس امکان‌پذیر نیست',
  '10': 'حساب سامانه پیامک فعال نیست',
  '11': 'ارسال پیامک انجام نشد',
  '12': 'مدارک حساب سامانه پیامک کامل نیست',
  '14': 'متن پیامک حاوی لینک است',
  '15': 'عبارت «لغو 11» در انتهای متن وجود ندارد',
  '16': 'شماره گیرنده‌ای یافت نشد',
  '17': 'متن پیامک خالی است',
  '18': 'شماره موبایل معتبر نیست',
  '19': 'سقف ارسال روزانه API تکمیل شده است',
};

const CLIENT_ERROR_VALUES = new Set(['7', '14', '15', '16', '17', '18']);

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const credentials = this.readCredentials();
    if (!credentials) {
      this.logger.warn(`SMS skipped; Farapayamak credentials are not set. Would send to ${input.phone}`);
      return {
        skipped: true,
        message: 'تنظیمات سامانه پیامک کامل نیست؛ ارسال ثبت شد',
      };
    }

    const phone = this.requireMobile(input.phone);
    const text = input.body.trim();
    if (!text) {
      throw new BadRequestException('متن پیامک خالی است');
    }

    let response: Response;
    try {
      response = await fetch(`${credentials.baseUrl}${SEND_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
          to: phone,
          from: credentials.from,
          text,
          isflash: false,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Farapayamak request failed for ${phone}: ${errorMessage(error)}`);
      throw new BadGatewayException('ارتباط با سامانه پیامک برقرار نشد');
    }

    const payload = (await response.json().catch(() => null)) as FarapayamakResponse | null;
    const value = stringifyValue(payload?.Value);
    const retStatus = Number(payload?.RetStatus);
    if (retStatus === SUCCESS_RET_STATUS && !VALUE_ERRORS[value]) {
      this.logger.log(`SMS sent to ${phone}`);
      return { skipped: false, recId: isRecId(value) ? value : undefined };
    }

    const message = this.resolveErrorMessage(value, payload?.StrRetStatus);
    this.logger.warn(`Farapayamak rejected SMS to ${phone}: ${message}`);
    if (CLIENT_ERROR_VALUES.has(value)) {
      throw new BadRequestException(message);
    }
    throw new BadGatewayException(message);
  }

  private readCredentials() {
    const username = this.config.get<string>('SMS_USERNAME')?.trim();
    const password = this.config.get<string>('SMS_PASSWORD')?.trim();
    const from = this.config.get<string>('SMS_FROM')?.trim();
    if (!username || !password || !from) {
      return null;
    }
    const baseUrl = (
      this.config.get<string>('SMS_BASE_URL')?.trim() || DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    return { username, password, from, baseUrl };
  }

  private requireMobile(input: string) {
    const phone = normalizeMobile(input);
    if (!/^09\d{9}$/.test(phone)) {
      throw new BadRequestException('شماره موبایل معتبر نیست');
    }
    return phone;
  }

  private resolveErrorMessage(value: string, strRetStatus?: string | null) {
    return (
      VALUE_ERRORS[value] ||
      strRetStatus?.trim() ||
      'ارسال پیامک از سامانه فراپیامک ناموفق بود'
    );
  }
}

function stringifyValue(value: FarapayamakResponse['Value']) {
  if (value == null) return '';
  return String(value).trim();
}

function isRecId(value: string) {
  if (!value || VALUE_ERRORS[value]) return false;
  return /^\d{5,}$/.test(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error';
}
