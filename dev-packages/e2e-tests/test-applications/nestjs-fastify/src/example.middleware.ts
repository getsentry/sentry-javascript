import { Injectable, NestMiddleware } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class ExampleMiddleware implements NestMiddleware {
  use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    // span that should be a child span of the middleware span
    Sentry.startSpan({ name: 'test-middleware-span' }, () => {});
    next();
  }
}
