import { withMonitor } from '@sentry/core';
import { replaceCronNames } from './common';

export interface NodeSchedule {
  scheduleJob(expression: string | Date | object, callback: () => void): unknown;
}

/**
 * Instruments the `node-schedule` library to send a check-in event to Sentry for each job execution.
 *
 * ```ts
 * import * as Sentry from '@sentry/node';
 * import * as schedule from 'node-schedule';
 *
 * const scheduleWithCheckIn = Sentry.cron.instrumentNodeSchedule(schedule, 'my-cron-job');
 *
 * const job = scheduleWithCheckIn.scheduleJob('* * * * *', () => {
 *  console.log('You will see this message every minute');
 * });
 * ```
 */
export function instrumentNodeSchedule<T>(lib: T & NodeSchedule, monitorSlug: string): T {
  let jobScheduled = false;

  return new Proxy(lib, {
    get(target, prop: keyof NodeSchedule) {
      if (prop === 'scheduleJob') {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        return new Proxy(target.scheduleJob, {
          apply(target, thisArg, argArray: Parameters<NodeSchedule['scheduleJob']>) {
            const [expression] = argArray;

            if (typeof expression !== 'string') {
              throw new Error('Automatic instrumentation of "node-schedule" only supports crontab string');
            }

            if (jobScheduled) {
              throw new Error(`A job named '${monitorSlug}' has already been scheduled`);
            }

            jobScheduled = true;

            return withMonitor(
              monitorSlug,
              () => {
                return target.apply(thisArg, argArray);
              },
              {
                schedule: { type: 'crontab', value: replaceCronNames(expression) },
              },
            );
          },
        });
      }

      return target[prop];
    },
  });
}
