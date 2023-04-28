import { runWithAsyncContext } from '@sentry/core';
import { captureCheckin } from '@sentry/node';
import type { NextApiRequest } from 'next';

/**
 * TODO
 */
export function wrapApiHandlerWithSentryCrons<F extends (...args: any[]) => any>(
  handler: F,
  vercelCronsConfig: { path?: string; schedule?: string }[] | undefined,
): F {
  return new Proxy(handler, {
    apply: (originalFunction, thisArg, args: [NextApiRequest]) => {
      return runWithAsyncContext(() => {
        let maybePromiseResult;
        const cronsKey = args[0].url;

        if (!vercelCronsConfig) {
          return originalFunction.apply(thisArg, args);
        }

        const vercelCron = vercelCronsConfig.find(vercelCron => vercelCron.path === cronsKey);

        if (!vercelCron || !vercelCron.path || !vercelCron.schedule) {
          return originalFunction.apply(thisArg, args);
        }

        const monitorSlug = vercelCron.path;

        captureCheckin(
          {
            monitorSlug,
            status: 'in_progress',
          },
          {
            schedule: {
              type: 'crontab',
              value: vercelCron.schedule,
            },
          },
        );

        const startTime = Date.now() / 1000;

        const handleErrorCase = (): void => {
          captureCheckin({
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          Promise.resolve(maybePromiseResult).then(
            () => {
              captureCheckin({
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
          captureCheckin({
            monitorSlug,
            status: 'ok',
            duration: Date.now() / 1000 - startTime,
          });
          return maybePromiseResult;
        }
      });
    },
  });
}
