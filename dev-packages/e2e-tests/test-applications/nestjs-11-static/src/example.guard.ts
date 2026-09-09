import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class ExampleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    Sentry.startSpan({ name: 'test-guard-span' }, () => {});
    return true;
  }
}
