import { withMonitor } from '@sentry/core';

export interface NodeCronOptions {
  name?: string;
  timezone?: string;
}

export interface NodeCron {
  schedule: (cronExpression: string, callback: () => void, options?: NodeCronOptions) => unknown;
}

const replacements: [string, string][] = [
  ['january', '1'],
  ['february', '2'],
  ['march', '3'],
  ['april', '4'],
  ['may', '5'],
  ['june', '6'],
  ['july', '7'],
  ['august', '8'],
  ['september', '9'],
  ['october', '10'],
  ['november', '11'],
  ['december', '12'],
  ['jan', '1'],
  ['feb', '2'],
  ['mar', '3'],
  ['apr', '4'],
  ['may', '5'],
  ['jun', '6'],
  ['jul', '7'],
  ['aug', '8'],
  ['sep', '9'],
  ['oct', '10'],
  ['nov', '11'],
  ['dec', '12'],
  ['sunday', '0'],
  ['monday', '1'],
  ['tuesday', '2'],
  ['wednesday', '3'],
  ['thursday', '4'],
  ['friday', '5'],
  ['saturday', '6'],
  ['sun', '0'],
  ['mon', '1'],
  ['tue', '2'],
  ['wed', '3'],
  ['thu', '4'],
  ['fri', '5'],
  ['sat', '6'],
];

function toSentryCrontab(cronExpression: string): string {
  return replacements.reduce(
    (acc, [name, replacement]) => acc.replace(new RegExp(name, 'gi'), replacement),
    cronExpression,
  );
}

/**
 * Wraps the node-cron library with check-in monitoring.
 *
 * ```ts
 * import * as Sentry from "@sentry/node";
 * import cron from "node-cron";
 *
 * const cronWithCheckIn = Sentry.cron.instrumentNodeCron(cron);
 *
 * cronWithCheckIn.schedule(
 *   "* * * * *",
 *   () => {
 *     console.log("running a task every minute");
 *   },
 *   { name: "my-cron-job" },
 * );
 * ```
 */
export function instrumentNodeCron<T>(lib: Partial<NodeCron> & T): T {
  return new Proxy(lib, {
    get(target, prop: keyof NodeCron) {
      if (prop === 'schedule' && target.schedule) {
        // When 'get' is called for schedule, return a proxied version of the schedule function
        return new Proxy(target.schedule, {
          apply(target, thisArg, argArray: Parameters<NodeCron['schedule']>) {
            const [expression, _, options] = argArray;

            if (!options?.name) {
              throw new Error('Missing "name" for scheduled job. A name is required for Sentry check-in monitoring.');
            }

            return withMonitor(
              options.name,
              () => {
                return target.apply(thisArg, argArray);
              },
              {
                schedule: { type: 'crontab', value: toSentryCrontab(expression) },
                timezone: options?.timezone,
              },
            );
          },
        });
      } else {
        return target[prop];
      }
    },
  });
}
