import { os } from '@orpc/server';
import * as Sentry from '@sentry/nextjs';

export const sentryTracingMiddleware = os.$context<{}>().middleware(async ({ context, next }) => {
  return Sentry.startSpan(
    { name: 'ORPC Middleware', op: 'middleware.orpc', attributes: { 'sentry.origin': 'auto' } },
    async () => {
      try {
        return await next();
      } catch (error) {
        Sentry.captureException(error);
        throw error;
      }
    },
  );
});
