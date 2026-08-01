import { getClient, getCurrentScope, withIsolationScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import { startNewTrace } from './tracing/trace';
import type { CheckIn, FinishedCheckIn, MonitorConfig } from './types/checkin';
import { debug } from './utils/debug-logger';
import { isThenable } from './utils/is';
import { uuid4 } from './utils/misc';
import { timestampInSeconds } from './utils/time';

/**
 * Wraps a callback with a cron monitor check in. The check in will be sent to Sentry when the callback finishes.
 *
 * @param monitorSlug The distinct slug of the monitor.
 * @param callback Callback to be monitored
 * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
 * to create a monitor automatically when sending a check in.
 */
export function withMonitor<T>(
  monitorSlug: CheckIn['monitorSlug'],
  callback: () => T,
  upsertMonitorConfig?: MonitorConfig,
): T {
  function runCallback(): T {
    const checkInId = captureCheckIn({ monitorSlug, status: 'in_progress' }, upsertMonitorConfig);
    const now = timestampInSeconds();

    function finishCheckIn(status: FinishedCheckIn['status']): void {
      captureCheckIn({ monitorSlug, status, checkInId, duration: timestampInSeconds() - now });
    }
    // Default behavior without isolateTrace
    let maybePromiseResult: T;
    try {
      maybePromiseResult = callback();
    } catch (e) {
      finishCheckIn('error');
      throw e;
    }

    if (isThenable(maybePromiseResult)) {
      return maybePromiseResult.then(
        r => {
          finishCheckIn('ok');
          return r;
        },
        e => {
          finishCheckIn('error');
          throw e;
        },
      ) as T;
    }
    finishCheckIn('ok');

    return maybePromiseResult;
  }

  // `withIsolationScope` resets the propagation context, so unless
  // `isolateTrace` is set we restore the parent's trace below. Copied rather
  // than aliased: the monitor scope must not share an object with the parent,
  // or in-place writes inside the callback would rewrite the parent's trace
  const oldPropagationContext = { ...getCurrentScope().getPropagationContext() };

  return withIsolationScope(() => {
    if (upsertMonitorConfig?.isolateTrace) {
      return startNewTrace(runCallback);
    }

    // If we are not isolating the trace, in this case we want to keep the same
    // trace as the parent
    const newPropagationContext = getCurrentScope().getPropagationContext();
    if (!newPropagationContext.parentSpanId) {
      getCurrentScope().setPropagationContext(oldPropagationContext);
    }

    return runCallback();
  });
}

/**
 * Create a cron monitor check in and send it to Sentry.
 *
 * @param checkIn An object that describes a check in.
 * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
 * to create a monitor automatically when sending a check in.
 */
export function captureCheckIn(checkIn: CheckIn, upsertMonitorConfig?: MonitorConfig): string {
  const scope = getCurrentScope();
  const client = getClient();
  if (!client) {
    DEBUG_BUILD && debug.warn('Cannot capture check-in. No client defined.');
  } else if (!client.captureCheckIn) {
    DEBUG_BUILD && debug.warn('Cannot capture check-in. Client does not support sending check-ins.');
  } else {
    return client.captureCheckIn(checkIn, upsertMonitorConfig, scope);
  }

  return uuid4();
}
