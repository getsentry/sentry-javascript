import { StatusType } from '@sentry/types';
/**
 * Converts an HTTP status code to sentry status {@link StatusType}.
 *
 * @param code number HTTP status code
 * @returns StatusType
 */
export function statusFromHttpCode(code: number): StatusType {
  if (code >= 200 && code < 300) {
    return 'success';
  }

  if (code === 429) {
    return 'rate_limit';
  }

  if (code >= 400 && code < 500) {
    return 'invalid';
  }

  if (code >= 500) {
    return 'failed';
  }

  return 'unknown';
}
