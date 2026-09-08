import { Injectable, Logger } from '@nestjs/common';

export type SendSmsInput = {
  phone: string;
  body: string;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async send(input: SendSmsInput) {
    this.logger.warn(
      `SMS pending implementation. Would send to ${input.phone}`,
    );
    return {
      skipped: true,
      message: 'سرویس پیامک به‌زودی پیاده‌سازی می‌شود',
    };
  }
}
