import { _INTERNAL_captureNitroRequestError } from '@sentry/server-utils';
import type { CapturedErrorContext } from 'nitro/types';

/**
 * Hook that can be added in a Nitro plugin. It captures an error and sends it to Sentry.
 */
export async function captureErrorHook(error: Error, errorContext: CapturedErrorContext): Promise<void> {
  await _INTERNAL_captureNitroRequestError(error, errorContext);
}
