import { withMonitor } from '@sentry/core';
import { replaceCronNames } from './common';

export type CronJobParams = {
  cronTime: string | Date;
  onTick: (context: unknown, onComplete?: unknown) => void | Promise<void>;
  onComplete?: () => void | Promise<void>;
  start?: boolean | null;
  context?: unknown;
  runOnInit?: boolean | null;
  utcOffset?: number;
  timeZone?: string;
  unrefTimeout?: boolean | null;
};

export type CronJob = {
  //
};

export type CronJobConstructor = {
  from: (param: CronJobParams) => CronJob;

  new (
    cronTime: CronJobParams['cronTime'],
    onTick: CronJobParams['onTick'],
    onComplete?: CronJobParams['onComplete'],
    start?: CronJobParams['start'],
    timeZone?: CronJobParams['timeZone'],
    context?: CronJobParams['context'],
    runOnInit?: CronJobParams['runOnInit'],
    utcOffset?: CronJobParams['utcOffset'],
    unrefTimeout?: CronJobParams['unrefTimeout'],
  ): CronJob;
};

const ERROR_TEXT = 'Automatic instrumentation of CronJob only supports crontab string';

/**
 * Instruments the `cron` library to send a check-in event to Sentry for each job execution.
 *
 * ```ts
 * import * as Sentry from '@sentry/node';
 * import { CronJob } from 'cron';
 *
 * const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, 'my-cron-job');
 *
 * // use the constructor
 * const job = new CronJobWithCheckIn('* * * * *', () => {
 *  console.log('You will see this message every minute');
 * });
 *
 * // or from
 * const job = CronJobWithCheckIn.from({ cronTime: '* * * * *', onTick: () => {
 *   console.log('You will see this message every minute');
 * });
 * ```
 */
export function instrumentCron<T>(lib: T & CronJobConstructor, monitorSlug: string): T {
  return new Proxy(lib, {
    construct(target, args: ConstructorParameters<CronJobConstructor>) {
      const [cronTime, onTick, onComplete, start, timeZone, ...rest] = args;

      if (typeof cronTime !== 'string') {
        throw new Error(ERROR_TEXT);
      }

      const cronString = replaceCronNames(cronTime);

      function monitoredTick(context: unknown, onComplete?: unknown): void | Promise<void> {
        return withMonitor(
          monitorSlug,
          () => {
            return onTick(context, onComplete);
          },
          {
            schedule: { type: 'crontab', value: cronString },
            ...(timeZone ? { timeZone } : {}),
          },
        );
      }

      return new target(cronTime, monitoredTick, onComplete, start, timeZone, ...rest);
    },
    get(target, prop: keyof CronJobConstructor) {
      if (prop === 'from') {
        return (param: CronJobParams) => {
          const { cronTime, onTick, timeZone } = param;

          if (typeof cronTime !== 'string') {
            throw new Error(ERROR_TEXT);
          }

          const cronString = replaceCronNames(cronTime);

          param.onTick = (context: unknown, onComplete?: unknown) => {
            return withMonitor(
              monitorSlug,
              () => {
                return onTick(context, onComplete);
              },
              {
                schedule: { type: 'crontab', value: cronString },
                ...(timeZone ? { timeZone } : {}),
              },
            );
          };

          return target.from(param);
        };
      } else {
        return target[prop];
      }
    },
  });
}
