import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

export type CooperativeBody<T> = {
  success: boolean;
  data: T | null;
  message: string;
};

export function cooperativeOk<T>(data: T): CooperativeBody<T> {
  return { success: true, data, message: '' };
}

@Catch()
export class CooperativeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CooperativeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: CooperativeBody<null>) => void };
    }>();
    const { status, message } = describeException(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }
    response.status(status).json({ success: false, data: null, message });
  }
}

function describeException(exception: unknown) {
  if (exception instanceof HttpException) {
    return { status: exception.getStatus(), message: exceptionText(exception) };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'خطای داخلی سرور' };
}

function exceptionText(exception: HttpException) {
  const body = exception.getResponse();
  if (typeof body === 'string' && body.trim()) return body;
  if (typeof body === 'object' && body && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message)) {
      const text = message.map((item) => String(item)).filter(Boolean).join(' ');
      if (text) return text;
    }
  }
  return 'درخواست نامعتبر است';
}
