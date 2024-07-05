import type { CronExpression } from '@nestjs/schedule';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';

/**
 * A decorator wrapping the native nest Cron decorator, sending check-ins to Sentry.
 */
export const SentryCron = (
  cronTime: string | CronExpression,
  monitorSlug: string,
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
    Cron(cronTime)(target, propertyKey, descriptor);
  };
};
