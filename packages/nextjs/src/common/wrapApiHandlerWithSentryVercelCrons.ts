import { captureCheckIn } from '@sentry/core';
import type { NextApiRequest } from 'next';

import type { VercelCronsConfig } from './types';

type EdgeRequest = {
  nextUrl: URL;
  headers: Headers;
};

/**
 * Wraps a function with Sentry crons instrumentation by automaticaly sending check-ins for the given Vercel crons config.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapApiHandlerWithSentryVercelCrons<F extends (...args: any[]) => any>(
  handler: F,
  vercelCronsConfig: VercelCronsConfig,
): F {
  return new Proxy(handler, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply: (originalFunction, thisArg, args: any[]) => {
      if (!args || !args[0]) {
        return originalFunction.apply(thisArg, args);
      }

      const [req] = args as [NextApiRequest | EdgeRequest];

      let maybePromiseResult;
      const cronsKey = 'nextUrl' in req ? req.nextUrl.pathname : req.url;
      const userAgentHeader = 'nextUrl' in req ? req.headers.get('user-agent') : req.headers['user-agent'];

      if (
        !vercelCronsConfig || // do nothing if vercel crons config is missing
        !userAgentHeader?.includes('vercel-cron') // do nothing if endpoint is not called from vercel crons
      ) {
        return originalFunction.apply(thisArg, args);
      }

      const vercelCron = vercelCronsConfig.find(vercelCron => vercelCron.path === cronsKey);

      if (!vercelCron || !vercelCron.path || !vercelCron.schedule) {
        return originalFunction.apply(thisArg, args);
      }

      const monitorSlug = vercelCron.path;

      const checkInId = captureCheckIn(
        {
          monitorSlug,
          status: 'in_progress',
        },
        {
          maxRuntime: 60 * 12, // (minutes) so 12 hours - just a very high arbitrary number since we don't know the actual duration of the users cron job
          schedule: {
            type: 'crontab',
            value: vercelCron.schedule,
          },
        },
      );

      const startTime = Date.now() / 1000;

      const handleErrorCase = (): void => {
        captureCheckIn({
          checkInId,
          monitorSlug,
          status: 'error',
          duration: Date.now() / 1000 - startTime,
        });
      };

      try {
        maybePromiseResult = originalFunction.apply(thisArg, args);
      } catch (e) {
        handleErrorCase();
        throw e;
      }

      if (typeof maybePromiseResult === 'object' && maybePromiseResult !== null && 'then' in maybePromiseResult) {
        Promise.resolve(maybePromiseResult).then(
          () => {
            captureCheckIn({
              checkInId,
              monitorSlug,
              status: 'ok',
              duration: Date.now() / 1000 - startTime,
            });
          },
          () => {
            handleErrorCase();
          },
        );

        // It is very important that we return the original promise here, because Next.js attaches various properties
        // to that promise and will throw if they are not on the returned value.
        return maybePromiseResult;
      } else {
        captureCheckIn({
          checkInId,
          monitorSlug,
          status: 'ok',
          duration: Date.now() / 1000 - startTime,
        });
        return maybePromiseResult;
      }
    },
  });
}
