import type { Span } from '@sentry/core';
import { _INTERNAL_safeDateNow, captureCheckIn, debug, getIsolationScope, spanToJSON } from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';
import type { VercelCronsConfig } from '../common/types';

// Attribute keys for storing cron check-in data on spans
const ATTR_SENTRY_CRON_CHECK_IN_ID = 'sentry.cron.checkInId';
const ATTR_SENTRY_CRON_MONITOR_SLUG = 'sentry.cron.monitorSlug';
const ATTR_SENTRY_CRON_START_TIME = 'sentry.cron.startTime';

/**
 * Gets the Vercel crons configuration that was injected at build time.
 */
function getVercelCronsConfig(): VercelCronsConfig {
  const globalWithCronsConfig = globalThis as typeof globalThis & {
    _sentryVercelCronsConfig?: string;
  };

  if (!globalWithCronsConfig._sentryVercelCronsConfig) {
    return undefined;
  }

  try {
    return JSON.parse(globalWithCronsConfig._sentryVercelCronsConfig) as VercelCronsConfig;
  } catch {
    return undefined;
  }
}

/**
 * Checks if the request is a Vercel cron request and starts a check-in if it matches a configured cron.
 */
export function maybeStartCronCheckIn(span: Span, route: string | undefined): void {
  const vercelCronsConfig = getVercelCronsConfig();
  if (!vercelCronsConfig || !route) {
    return;
  }

  // Get headers from the isolation scope
  const headers = getIsolationScope().getScopeData().sdkProcessingMetadata?.normalizedRequest?.headers as
    | Record<string, string | string[] | undefined>
    | undefined;

  if (!headers) {
    return;
  }

  // Check if this is a Vercel cron request
  const userAgent = Array.isArray(headers['user-agent']) ? headers['user-agent'][0] : headers['user-agent'];

  if (!userAgent?.includes('vercel-cron')) {
    return;
  }

  // Find matching cron configuration
  const matchedCron = vercelCronsConfig.find(cron => cron.path === route);

  if (!matchedCron?.path || !matchedCron.schedule) {
    return;
  }

  const monitorSlug = matchedCron.path;
  const startTime = _INTERNAL_safeDateNow() / 1000;

  // Start the check-in
  const checkInId = captureCheckIn(
    {
      monitorSlug,
      status: 'in_progress',
    },
    {
      maxRuntime: 60 * 12, // 12 hours - high arbitrary number since we don't know the actual duration
      schedule: {
        type: 'crontab',
        value: matchedCron.schedule,
      },
    },
  );

  DEBUG_BUILD && debug.log(`[Cron] Started check-in for "${monitorSlug}" with ID "${checkInId}"`);

  // Store check-in data on the span for completion later
  span.setAttribute(ATTR_SENTRY_CRON_CHECK_IN_ID, checkInId);
  span.setAttribute(ATTR_SENTRY_CRON_MONITOR_SLUG, monitorSlug);
  span.setAttribute(ATTR_SENTRY_CRON_START_TIME, startTime);
}

/**
 * Completes a Vercel cron check-in when a span ends.
 * Should be called from the spanEnd event handler.
 */
export function maybeCompleteCronCheckIn(span: Span): void {
  const spanData = spanToJSON(span).data;

  const checkInId = spanData?.[ATTR_SENTRY_CRON_CHECK_IN_ID];
  const monitorSlug = spanData?.[ATTR_SENTRY_CRON_MONITOR_SLUG];
  const startTime = spanData?.[ATTR_SENTRY_CRON_START_TIME];

  if (!checkInId || !monitorSlug || typeof startTime !== 'number') {
    return;
  }

  const duration = _INTERNAL_safeDateNow() / 1000 - startTime;
  const spanStatus = spanToJSON(span).status;

  // Determine check-in status based on span status
  // Only mark as error if span status is explicitly 'error', otherwise treat as success
  // Span status can be 'ok', 'error', or undefined (unset) - undefined means success
  const checkInStatus = spanStatus === 'error' ? 'error' : 'ok';

  captureCheckIn({
    checkInId: checkInId as string,
    monitorSlug: monitorSlug as string,
    status: checkInStatus,
    duration,
  });

  // Clean up the cron attributes from the span
  span.setAttribute(ATTR_SENTRY_CRON_CHECK_IN_ID, undefined);
  span.setAttribute(ATTR_SENTRY_CRON_MONITOR_SLUG, undefined);
  span.setAttribute(ATTR_SENTRY_CRON_START_TIME, undefined);

  DEBUG_BUILD && debug.log(`[Cron] Completed check-in for "${monitorSlug}" with status "${checkInStatus}"`);
}
