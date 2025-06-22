import { withMonitor } from '@sentry/core';
import { replaceCronNames } from './common';

export interface NodeSchedule {
  scheduleJob(
    nameOrExpression: string | Date | object,
    expressionOrCallback: string | Date | object | (() => void),
    callback?: () => void,
  ): unknown;
}

/**
 * Instruments the `node-schedule` library to send a check-in event to Sentry for each job execution.
 *
 * ```ts
 * import * as Sentry from '@sentry/node';
 * import * as schedule from 'node-schedule';
 *
 * const scheduleWithCheckIn = Sentry.cron.instrumentNodeSchedule(schedule);
 *
 * const job = scheduleWithCheckIn.scheduleJob('my-cron-job', '* * * * *', () => {
 *  console.log('You will see this message every minute');
 * });
 * ```
 */
export function instrumentNodeSchedule<T>(lib: T & NodeSchedule): T {
  return new Proxy(lib, {
    get(target, prop: keyof NodeSchedule) {
      if (prop === 'scheduleJob') {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        return new Proxy(target.scheduleJob, {
          apply(target, thisArg, argArray: Parameters<NodeSchedule['scheduleJob']>) {
            const [nameOrExpression, expressionOrCallback, callback] = argArray;

            if (
              typeof nameOrExpression !== 'string' ||
              typeof expressionOrCallback !== 'string' ||
              typeof callback !== 'function'
            ) {
              throw new Error(
                "Automatic instrumentation of 'node-schedule' requires the first parameter of 'scheduleJob' to be a job name string and the second parameter to be a crontab string",
              );
            }

            const monitorSlug = nameOrExpression;
            const expression = expressionOrCallback;

            async function monitoredCallback(): Promise<void> {
              return withMonitor(
                monitorSlug,
                async () => {
                  await callback?.();
                },
                {
                  schedule: { type: 'crontab', value: replaceCronNames(expression) },
                },
              );
            }

            return target.apply(thisArg, [monitorSlug, expression, monitoredCallback]);
          },
        });
      }

      return target[prop];
    },
  });
}
