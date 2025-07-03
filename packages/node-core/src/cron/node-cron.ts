import { captureException, withMonitor } from '@sentry/core';
import { replaceCronNames } from './common';

export interface NodeCronOptions {
  name: string;
  timezone?: string;
}

export interface NodeCron {
  schedule: (cronExpression: string, callback: () => void, options: NodeCronOptions | undefined) => unknown;
}

/**
 * Wraps the `node-cron` library with check-in monitoring.
 *
 * ```ts
 * import * as Sentry from "@sentry/node";
 * import * as cron from "node-cron";
 *
 * const cronWithCheckIn = Sentry.cron.instrumentNodeCron(cron);
 *
 * cronWithCheckIn.schedule(
 *   "* * * * *",
 *   () => {
 *     console.log("running a task every minute");
 *   },
 *   { name: "my-cron-job" },
 * );
 * ```
 */
export function instrumentNodeCron<T>(lib: Partial<NodeCron> & T): T {
  return new Proxy(lib, {
    get(target, prop) {
      if (prop === 'schedule' && target.schedule) {
        // When 'get' is called for schedule, return a proxied version of the schedule function
        return new Proxy(target.schedule, {
          apply(target, thisArg, argArray: Parameters<NodeCron['schedule']>) {
            const [expression, callback, options] = argArray;

            const name = options?.name;
            const timezone = options?.timezone;

            if (!name) {
              throw new Error('Missing "name" for scheduled job. A name is required for Sentry check-in monitoring.');
            }

            const monitoredCallback = async (): Promise<void> => {
              return withMonitor(
                name,
                async () => {
                  // We have to manually catch here and capture the exception because node-cron swallows errors
                  // https://github.com/node-cron/node-cron/issues/399
                  try {
                    return await callback();
                  } catch (e) {
                    captureException(e);
                    throw e;
                  }
                },
                {
                  schedule: { type: 'crontab', value: replaceCronNames(expression) },
                  timezone,
                },
              );
            };

            return target.apply(thisArg, [expression, monitoredCallback, options]);
          },
        });
      } else {
        return target[prop as keyof T];
      }
    },
  });
}
