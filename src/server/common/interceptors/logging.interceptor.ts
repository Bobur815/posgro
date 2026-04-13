// src/server/common/interceptors/logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const TASHKENT_LOCALE = 'uz-UZ';
const TASHKENT_TZ = 'Asia/Tashkent';

function nowTashkent(): string {
  return new Date().toLocaleString(TASHKENT_LOCALE, {
    timeZone: TASHKENT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(',', '') + ' +05:00';
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const startTime = Date.now();

    console.log(`[${nowTashkent()}] ${method} ${url}`, {
      body: this.sanitizeBody(body),
    });

    return next.handle().pipe(
      tap({
        next: (_data) => {
          const duration = Date.now() - startTime;
          console.log(`[${nowTashkent()}] ${method} ${url} - ${duration}ms`);
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          console.error(
            `[${nowTashkent()}] ${method} ${url} - ${duration}ms - ERROR:`,
            error.message,
          );
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;

    const sanitized = { ...body };

    // Remove sensitive fields from logs
    const sensitiveFields = ['password', 'token', 'secret'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
