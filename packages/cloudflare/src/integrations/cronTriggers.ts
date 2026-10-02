import type { IntegrationFn, MonitorConfig } from '@sentry/core';
import { captureCheckIn, debug, defineIntegration, timestampInSeconds } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

const INTEGRATION_NAME = 'CronTriggers' as const;

/**
 * The monitor slug and settings for a Cron Trigger, see `cronTriggersIntegration`.
 */
export type CronTriggerMonitorSettings = { slug: string } & Omit<MonitorConfig, 'schedule' | 'timezone'>;

export interface CronTriggersOptions {
  /**
   * Chooses the monitor slug for a cron expression. It can also return an object with the `slug`
   * and other monitor settings, such as `checkinMargin` or `maxRuntime`. Returning `undefined`
   * sends no check-ins for that trigger, and so does a function that throws.
   */
  slug?: (cron: string) => string | CronTriggerMonitorSettings | undefined;
}

/** @internal Used by the scheduled handler instrumentation. */
export interface CronTriggersIntegration {
  name: string;
  startCheckIn(cron: string): ((status: 'ok' | 'error') => void) | undefined;
}

const SLUG_TOKENS: Record<string, string> = { ' ': '-', '*': 'x', ',': '_', '-': 'to', '/': 'by' };

/**
 * Derives a monitor slug from a cron expression, e.g. `30 9 * * 1-5` -> `cron-30-9-x-x-1to5`.
 *
 * A hash of the expression is appended when it has any other characters or the slug would be
 * longer than 50 characters, so different expressions don't share a slug.
 */
function cronToMonitorSlug(cron: string): string {
  const expression = cron.trim().toLowerCase().split(/\s+/).join(' ');
  const slug = `cron-${expression.replace(/[ *,\-/]/g, char => SLUG_TOKENS[char] as string)}`;
  if (/^[a-z0-9_-]{1,50}$/.test(slug)) {
    return slug;
  }

  // A polynomial string hash modulo 2^31 - 1, at most 6 characters in base 36.
  let hash = 0;
  for (let i = 0; i < expression.length; i++) {
    hash = (hash * 31 + expression.charCodeAt(i)) % 2147483647;
  }
  return `${slug.replace(/[^a-z0-9_-]+/g, '-').slice(0, 43)}-${hash.toString(36)}`;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Cloudflare numbers weekdays from 1 = Sunday to 7 = Saturday. Returns -1 for anything else.
function weekdayIndex(value: string): number {
  return /^[1-7]$/.test(value) ? Number(value) - 1 : WEEKDAYS.indexOf(value.toUpperCase());
}

function convertWeekdayItem(item: string): string | undefined {
  const match = item.match(/^(\*|\w+)(?:-(\w+))?(?:\/(\d+))?$/);
  if (!match) {
    return undefined;
  }
  const [, from, to, step] = match;
  if (step && !(Number(step) > 0)) {
    return undefined;
  }

  if (from === '*') {
    return to ? undefined : step ? `SUN-SAT/${step}` : '*';
  }

  const start = weekdayIndex(from as string);
  // A step without an end runs to Saturday, so it is written as a range.
  const end = to ? weekdayIndex(to) : step ? 6 : start;
  if (start < 0 || end < start) {
    return undefined;
  }

  // A step over a single day would run on to Sunday in Sentry's cron parser, so it is left out.
  if (start === end) {
    return WEEKDAYS[start];
  }
  const days = `${WEEKDAYS[start]}-${WEEKDAYS[end]}`;
  return step ? `${days}/${step}` : days;
}

/**
 * Converts a Cloudflare cron expression into a crontab Sentry accepts, which numbers weekdays from
 * 0 = Sunday. Returns `undefined` if the weekday field can't be converted.
 */
function cloudflareCronToCrontab(cron: string): string | undefined {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return undefined;
  }

  const weekdays = (fields[4] as string).split(',').map(convertWeekdayItem);
  return weekdays.includes(undefined) ? undefined : [...fields.slice(0, 4), weekdays.join(',')].join(' ');
}

const _cronTriggersIntegration = ((options: CronTriggersOptions = {}): CronTriggersIntegration => {
  return {
    name: INTEGRATION_NAME,
    startCheckIn(cron) {
      // Manual runs, e.g. through `wrangler dev --test-scheduled`, can have no cron expression.
      if (!cron) {
        return undefined;
      }

      let monitor: string | CronTriggerMonitorSettings | undefined;
      try {
        monitor = options.slug ? options.slug(cron) : cronToMonitorSlug(cron);
      } catch (e) {
        DEBUG_BUILD && debug.warn(`[Cron Triggers] \`slug\` threw for "${cron}", sending no check-ins:`, e);
        return undefined;
      }

      if (!monitor) {
        return undefined;
      }

      const { slug: monitorSlug, ...monitorSettings } = typeof monitor === 'string' ? { slug: monitor } : monitor;
      if (!monitorSlug) {
        return undefined;
      }

      const crontab = cloudflareCronToCrontab(cron);
      if (!crontab) {
        DEBUG_BUILD &&
          debug.warn(`[Cron Triggers] Can't convert "${cron}" to a Sentry schedule, sending check-ins without one.`);
      }

      // Check-ins are captured directly rather than through `withMonitor`, which would fork the
      // isolation scope and lose the invocation state attached to it.
      const checkInId = captureCheckIn(
        { monitorSlug, status: 'in_progress' },
        crontab ? { ...monitorSettings, schedule: { type: 'crontab', value: crontab } } : undefined,
      );
      const startTime = timestampInSeconds();

      return status => {
        captureCheckIn({ monitorSlug, status, checkInId, duration: timestampInSeconds() - startTime });
      };
    },
  };
}) satisfies IntegrationFn;

/**
 * Sends cron check-ins to Sentry for every Cron Trigger run of the `scheduled` handler.
 *
 * Each check-in carries the trigger's cron expression as the monitor schedule, so Sentry creates
 * the monitor on the first run and keeps its schedule in sync. Cloudflare numbers weekdays from
 * 1 = Sunday, so the weekday field is converted to names before it is sent (`1-5` becomes
 * `SUN-THU`). If it can't be converted, check-ins are sent without a schedule. Monitors are billed,
 * which is why this integration is not enabled by default.
 *
 * By default, the monitor slug is `cron-` followed by the cron expression, lowercased, with fields
 * joined by `-` and `*`, `,`, `-` and `/` written as `x`, `_`, `to` and `by`. For example,
 * `30 9 * * 1-5` becomes `cron-30-9-x-x-1to5`. If the expression has other characters or the slug
 * would be longer than 50 characters, it is shortened and a hash of the expression is appended.
 * Workers that report to the same project and share a cron expression therefore share a monitor.
 * Pass `slug` to choose the slug, and optionally other monitor settings, per cron expression.
 *
 * Runs without a cron expression, such as some manual `--test-scheduled` runs, send no check-ins.
 * The Workers clock only advances on I/O, so the duration of a job that only uses the CPU may be
 * reported as about 0.
 *
 * @example
 * ```ts
 * export default Sentry.withSentry(
 *   (env) => ({
 *     dsn: env.SENTRY_DSN,
 *     integrations: [Sentry.cronTriggersIntegration()],
 *   }),
 *   handler,
 * );
 * ```
 *
 * @example
 * ```ts
 * export default Sentry.withSentry(
 *   (env) => ({
 *     dsn: env.SENTRY_DSN,
 *     integrations: [
 *       Sentry.cronTriggersIntegration({
 *         slug: (cron) => (cron === '0 0 * * *' ? { slug: 'nightly-cleanup', maxRuntime: 30 } : undefined),
 *       }),
 *     ],
 *   }),
 *   handler,
 * );
 * ```
 */
export const cronTriggersIntegration = defineIntegration(_cronTriggersIntegration);
