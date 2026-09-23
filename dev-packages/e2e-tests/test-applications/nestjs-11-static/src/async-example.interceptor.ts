import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { tap } from 'rxjs';

@Injectable()
export class AsyncInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    Sentry.startSpan({ name: 'test-async-interceptor-span' }, () => {});
    return Promise.resolve(
      next.handle().pipe(
        tap(() => {
          Sentry.startSpan({ name: 'test-async-interceptor-span-after-route' }, () => {});
        }),
      ),
    );
  }
}
