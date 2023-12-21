import { withMonitor } from '@sentry/core';

type CronJobParams = {
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

type CronJob = {
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
 * const job = CronJobWithCheckIn.from({cronTime: '* * * * *', onTick: () => {
 *   console.log('You will see this message every minute');
 * });
 * ```
 */
export function instrumentCron<T>(lib: T & CronJob, monitorSlug: string): T {
  return new Proxy(lib, {
    construct(target, args: ConstructorParameters<CronJob>) {
      const [cronTime, onTick, onComplete, start, timeZone, ...rest] = args;

      if (typeof cronTime !== 'string') {
        throw new Error('Cron time must be a string');
      }

      const cronString = cronTime;

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
    get(target, prop: keyof CronJob) {
      if (prop === 'from') {
        return (param: CronJobParams) => {
          const { cronTime, onTick, timeZone } = param;

          if (typeof cronTime !== 'string') {
            throw new Error('Cron time must be a string');
          }

          param.onTick = (context: unknown, onComplete?: unknown) => {
            return withMonitor(
              monitorSlug,
              () => {
                return onTick(context, onComplete);
              },
              {
                schedule: { type: 'crontab', value: cronTime },
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
