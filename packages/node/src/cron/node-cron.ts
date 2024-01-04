import { withMonitor } from '@sentry/core';
import { replaceCronNames } from './common';

export interface NodeCronOptions {
  name?: string;
  timezone?: string;
}

export interface NodeCron {
  schedule: (cronExpression: string, callback: () => void, options?: NodeCronOptions) => unknown;
}

/**
 * Wraps the `node-cron` library with check-in monitoring.
 *
 * ```ts
 * import * as Sentry from "@sentry/node";
 * import cron from "node-cron";
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
    get(target, prop: keyof NodeCron) {
      if (prop === 'schedule' && target.schedule) {
        // When 'get' is called for schedule, return a proxied version of the schedule function
        return new Proxy(target.schedule, {
          apply(target, thisArg, argArray: Parameters<NodeCron['schedule']>) {
            const [expression, , options] = argArray;

            if (!options?.name) {
              throw new Error('Missing "name" for scheduled job. A name is required for Sentry check-in monitoring.');
            }

            return withMonitor(
              options.name,
              () => {
                return target.apply(thisArg, argArray);
              },
              {
                schedule: { type: 'crontab', value: replaceCronNames(expression) },
                timezone: options?.timezone,
              },
            );
          },
        });
      } else {
        return target[prop];
      }
    },
  });
}
