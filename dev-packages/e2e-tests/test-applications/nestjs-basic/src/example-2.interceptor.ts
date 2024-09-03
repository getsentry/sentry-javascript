import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class ExampleInterceptor2 implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    Sentry.startSpan({ name: 'test-interceptor-span-2' }, () => {});
    return next.handle().pipe();
  }
}
