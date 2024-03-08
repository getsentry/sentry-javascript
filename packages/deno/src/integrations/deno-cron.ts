import { defineIntegration, getClient, withMonitor } from '@sentry/core';
import type { Client, IntegrationFn } from '@sentry/types';
import { parseScheduleToString } from './deno-cron-format';

type CronOptions = { backoffSchedule?: number[]; signal?: AbortSignal };
type CronFn = () => void | Promise<void>;
// Parameters<typeof Deno.cron> doesn't work well with the overloads 🤔
type CronParams = [string, string | Deno.CronSchedule, CronFn | CronOptions, CronFn | CronOptions | undefined];

const INTEGRATION_NAME = 'DenoCron';

const SETUP_CLIENTS = new WeakMap<Client, boolean>();

const _denoCronIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
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
            if (!SETUP_CLIENTS.has(getClient() as Client)) {
              return fn();
            }

            await withMonitor(monitorSlug, async () => fn(), {
              schedule: { type: 'crontab', value: parseScheduleToString(schedule) },
              // (minutes) so 12 hours - just a very high arbitrary number since we don't know the actual duration of the users cron job
              maxRuntime: 60 * 12,
              // Deno Deploy docs say that the cron job will be called within 1 minute of the scheduled time
              checkinMargin: 1,
            });
          }

          return target.call(thisArg, monitorSlug, schedule, options || {}, cronCalled);
        },
      });
    },
    setup(client) {
      SETUP_CLIENTS.set(client, true);
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments Deno.cron to automatically capture cron check-ins.
 *
 * Enabled by default in the Deno SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.denoCronIntegration(),
 *   ],
 * })
 * ```
 */
export const denoCronIntegration = defineIntegration(_denoCronIntegration);
