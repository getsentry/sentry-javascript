import type { CronExpression } from '@nestjs/schedule';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';

/**
 * @ref https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/cron/index.d.ts
 */
export type CronOptions = {
  /**
   * Specify the name of your cron job. This will allow to inject your cron job reference through `@InjectCronRef`.
   */
  name?: string;

  /**
   * Specify the timezone for the execution. This will modify the actual time relative to your timezone. If the timezone is invalid, an error is thrown. You can check all timezones available at [Moment Timezone Website](http://momentjs.com/timezone/). Probably don't use both ```timeZone``` and ```utcOffset``` together or weird things may happen.
   */
  timeZone?: unknown;
  /**
   * This allows you to specify the offset of your timezone rather than using the ```timeZone``` param. Probably don't use both ```timeZone``` and ```utcOffset``` together or weird things may happen.
   */
  utcOffset?: unknown;

  /**
   * If you have code that keeps the event loop running and want to stop the node process when that finishes regardless of the state of your cronjob, you can do so making use of this parameter. This is off by default and cron will run as if it needs to control the event loop. For more information take a look at [timers#timers_timeout_unref](https://nodejs.org/api/timers.html#timers_timeout_unref) from the NodeJS docs.
   */
  unrefTimeout?: boolean;

  /**
   * This flag indicates whether the job will be executed at all.
   * @default false
   */
  disabled?: boolean;
} & ( // make timeZone & utcOffset mutually exclusive
  | {
      timeZone?: string;
      utcOffset?: never;
    }
  | {
      timeZone?: never;
      utcOffset?: number;
    }
);

/**
 * A decorator wrapping the native nest Cron decorator, sending check-ins to Sentry.
 */
export const SentryCron = (
  cronTime: string | CronExpression,
  monitorSlug: string,
  options: CronOptions = {},
): MethodDecorator => {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalMethod = descriptor.value as (...args: any[]) => Promise<any>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = async function (...args: any[]) {
      const checkInId = Sentry.captureCheckIn({
        monitorSlug,
        status: 'in_progress',
      });

      try {
        await originalMethod.apply(this, args);

        // cron job successful
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug,
          status: 'ok',
        });
      } catch (error) {
        // cron job failed
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug,
          status: 'error',
        });
        throw error;
      }
    };

    // apply native nest cron decorator with instrumented method
    Cron(cronTime, options)(target, propertyKey, descriptor);
  };
};
