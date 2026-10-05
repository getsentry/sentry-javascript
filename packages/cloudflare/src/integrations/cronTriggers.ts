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
 * Derives a monitor slug from a cron expression, e.g. `30 9 * * MON-FRI` -> `cron-30-9-x-x-montofri`.
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

  // `*` and `*/n` give the same days in both numberings, and keep their `*` meaning for Sentry.
  if (from === '*') {
    return to ? undefined : item;
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
 * 0 = Sunday. Returns `undefined` if the day fields can't be converted.
 */
function cloudflareCronToCrontab(cron: string): string | undefined {
  const fields = cron.trim().split(/\s+/);
  // Sentry rejects `W` and `?` in the day of month. Cloudflare doesn't document how both day fields
  // combine when both are set, so one of them has to be `*`.
  if (fields.length !== 5 || /[w?]/i.test(fields[2] as string) || (fields[2] !== '*' && fields[4] !== '*')) {
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
          debug.warn(
            `[Cron Triggers] Can't convert "${cron}" to a Sentry schedule, sending check-ins without a schedule or the other monitor settings.`,
          );
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
 * Sends cron check-ins for every Cron Trigger run of the `scheduled` handler, with the trigger's
 * schedule, so Sentry creates the monitor on the first run.
 *
 * Cron Triggers have no names, so map each cron expression to a slug. Without `slug`, the slug is
 * derived from the expression (`30 9 * * MON-FRI` becomes `cron-30-9-x-x-montofri`) and changes with it.
 *
 * @example
 * ```ts
 * const jobs = {
 *   '30 9 * * MON-FRI': { slug: 'daily-report', run: dailyReport },
 * };
 *
 * export default Sentry.withSentry(
 *   (env) => ({
 *     dsn: env.SENTRY_DSN,
 *     integrations: [Sentry.cronTriggersIntegration({ slug: (cron) => jobs[cron]?.slug })],
 *   }),
 *   {
 *     async scheduled(controller, env) {
 *       await jobs[controller.cron]?.run(env);
 *     },
 *   },
 * );
 * ```
 */
export const cronTriggersIntegration = defineIntegration(_cronTriggersIntegration);
