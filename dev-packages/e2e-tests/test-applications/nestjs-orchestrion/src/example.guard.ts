import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class ExampleGuard implements CanActivate {
  public canActivate(_context: ExecutionContext): boolean {
    // Child span
    // should nest under the guard span (middleware.nestjs / .guard).
    Sentry.startSpan({ name: 'test-guard-span' }, () => undefined);
    return true;
  }
}
