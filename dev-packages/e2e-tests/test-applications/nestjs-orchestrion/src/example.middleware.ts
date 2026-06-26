import { Injectable, NestMiddleware } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class ExampleMiddleware implements NestMiddleware {
  public use(_req: Request, _res: Response, next: NextFunction): void {
    // Child span
    // should nest under the middleware span.
    Sentry.startSpan({ name: 'test-middleware-span' }, () => undefined);
    next();
  }
}
