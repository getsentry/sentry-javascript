import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { tap } from 'rxjs';

@Injectable()
export class ExampleInterceptor implements NestInterceptor {
  public intercept(_context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    // Runs before `next.handle()`
    // nests under the interceptor "before" span.
    Sentry.startSpan({ name: 'test-interceptor-span-before' }, () => undefined);
    return next.handle().pipe(
      tap(() => {
        // Runs after the route
        // nests under the "Interceptors - After Route" span.
        Sentry.startSpan({ name: 'test-interceptor-span-after' }, () => undefined);
      }),
    );
  }
}
