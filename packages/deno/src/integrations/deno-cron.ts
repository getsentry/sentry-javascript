import { withMonitor } from '@sentry/core';
import type { Integration } from '@sentry/types';
import type { DenoClient } from '../client';

type CronOptions = { backoffSchedule?: number[]; signal?: AbortSignal };
type CronFn = () => void | Promise<void>;
// Parameters<typeof Deno.cron> doesn't work well with the overloads 🤔
type CronParams = [string, string | Deno.CronSchedule, CronFn | CronOptions, CronFn | CronOptions | undefined];

/**
 * Copied from Deno source:
 * // Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
 * https://github.com/denoland/deno/blob/cd480b481ee1b4209910aa7a8f81ffa996e7b0f9/ext/cron/01_cron.ts
 */
function formatToCronSchedule(
  value?:
    | number
    | { exact: number | number[] }
    | {
        start?: number;
        end?: number;
        every?: number;
      },
): string {
  if (value === undefined) {
    return '*';
  } else if (typeof value === 'number') {
    return value.toString();
  } else {
    const { exact } = value as { exact: number | number[] };
    if (exact === undefined) {
      const { start, end, every } = value as {
        start?: number;
        end?: number;
        every?: number;
      };
      if (start !== undefined && end !== undefined && every !== undefined) {
        return `${start}-${end}/${every}`;
      } else if (start !== undefined && end !== undefined) {
        return `${start}-${end}`;
      } else if (start !== undefined && every !== undefined) {
        return `${start}/${every}`;
      } else if (start !== undefined) {
        return `${start}/1`;
      } else if (end === undefined && every !== undefined) {
        return `*/${every}`;
      } else {
        throw new TypeError('Invalid cron schedule');
      }
    } else {
      if (typeof exact === 'number') {
        return exact.toString();
      } else {
        return exact.join(',');
      }
    }
  }
}

/**
 * Copied from Deno source:
 * // Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
 * https://github.com/denoland/deno/blob/cd480b481ee1b4209910aa7a8f81ffa996e7b0f9/ext/cron/01_cron.ts
 */
function parseScheduleToString(schedule: string | Deno.CronSchedule): string {
  if (typeof schedule === 'string') {
    return schedule;
  } else {
    const { minute, hour, dayOfMonth, month, dayOfWeek } = schedule;

    return `${formatToCronSchedule(minute)} ${formatToCronSchedule(hour)} ${formatToCronSchedule(
      dayOfMonth,
    )} ${formatToCronSchedule(month)} ${formatToCronSchedule(dayOfWeek)}`;
  }
}

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
  }
}
