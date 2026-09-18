import { Injectable, NestMiddleware } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class ExampleMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // span that should be a child span of the middleware span
    Sentry.startSpan({ name: 'test-middleware-span' }, () => {});
    next();
  }
}
