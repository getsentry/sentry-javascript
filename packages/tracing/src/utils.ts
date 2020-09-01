import { Options } from '@sentry/types';

/**
 * Determines if tracing is currently enabled.
 *
 * Tracing is enabled when at least one of `tracesSampleRate` and `tracesSampler` is defined in the SDK config.
 */
export function hasTracingEnabled(options: Options): boolean {
  return 'tracesSampleRate' in options || 'tracesSampler' in options;
}
