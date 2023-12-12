import type { Integration } from '@sentry/types';
import type { DenoClient } from '../client';

type CronOptions = { backoffSchedule?: number[]; signal?: AbortSignal };
type CronFn = () => void | Promise<void>;
// Parameters<typeof Deno.cron> doesn't work well with the overloads 🤔
type CronParams = [string, string, CronFn | CronOptions, CronFn | CronOptions | undefined];

/** Instruments Deno.cron to automatically capture cron check-ins */
export class DenoCron implements Integration {
  /** @inheritDoc */
  public static id = 'DenoCron';

  /** @inheritDoc */
  public name: string = DenoCron.id;

  /** @inheritDoc */
  public setupOnce(): void {
    //
  }

  /** @inheritDoc */
  public setup(client: DenoClient): void {
    // eslint-disable-next-line deprecation/deprecation
    if (!Deno.cron) {
      // The cron API is not available in this Deno version use --unstable flag!
      return;
    }

    // eslint-disable-next-line deprecation/deprecation
    Deno.cron = new Proxy(Deno.cron, {
      // eslint-disable-next-line deprecation/deprecation
      apply(target, thisArg, argArray: CronParams) {
        const [monitorSlug, schedule, opt1, opt2] = argArray;
        let options: CronOptions | undefined;
        let fn: CronFn;

        if (typeof opt1 === 'function' && typeof opt2 !== 'function') {
          fn = opt1;
          options = opt2;
        } else if (typeof opt1 !== 'function' && typeof opt2 === 'function') {
          fn = opt2;
          options = opt1;
        }

        async function cronCalled(): Promise<void> {
          const checkInId = client.captureCheckIn(
            { monitorSlug, status: 'in_progress' },
            { schedule: { type: 'crontab', value: schedule } },
          );

          const startTime = Date.now() / 1000;

          try {
            await fn();
            client.captureCheckIn({
              checkInId,
              monitorSlug,
              status: 'ok',
              duration: Date.now() / 1000 - startTime,
            });
          } catch (e) {
            client.captureCheckIn({
              checkInId,
              monitorSlug,
              status: 'error',
              duration: Date.now() / 1000 - startTime,
            });

            throw e;
          }
        }

        return target.call(thisArg, monitorSlug, schedule, options || {}, cronCalled);
      },
    });
  }
}
