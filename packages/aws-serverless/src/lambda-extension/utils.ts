import { consoleSandbox, truncate } from '@sentry/core';
import { ERROR_BODY_MAX_LENGTH, POLL_RETRY_BASE_MS, POLL_RETRY_MAX_MS } from './constants';

/**
 * `debug` is only enabled from `Sentry.init`, which this separate process never calls, so anything
 * reported through the logger from the extension is invisible under every option and env var.
 */
export function logError(message: string, ...rest: unknown[]): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.error(`Sentry Lambda extension: ${message}`, ...rest);
  });
}

/** Configuration advice rather than a failure, so it must not trip an alarm filtering on ERROR. */
export function logWarn(message: string): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(`Sentry Lambda extension: ${message}`);
  });
}

/** A response body only ever reaches the console, where the whole of it is nobody's friend. */
export function truncateBody(body: string): string {
  return truncate(body, ERROR_BODY_MAX_LENGTH);
}

export function retryDelayMs(attempt: number): number {
  return Math.min(POLL_RETRY_BASE_MS * 2 ** (attempt - 1), POLL_RETRY_MAX_MS);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
