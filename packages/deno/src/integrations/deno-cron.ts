import { withMonitor } from '@sentry/core';
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
          await withMonitor(monitorSlug, async () => fn(), {
            schedule: { type: 'crontab', value: schedule },
            // (minutes) so 12 hours - just a very high arbitrary number since we don't know the actual duration of the users cron job
            maxRuntime: 60 * 12,
          });
        }

        return target.call(thisArg, monitorSlug, schedule, options || {}, cronCalled);
      },
    });
  }
}
