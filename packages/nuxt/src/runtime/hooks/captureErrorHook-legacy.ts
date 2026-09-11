// eslint-disable-next-line import/no-extraneous-dependencies
import { H3Error } from 'h3';
import { createCaptureErrorHook } from '../utils/captureError';

/**
 * Hook that can be added in a Nitro plugin. It captures an error and sends it to Sentry.
 *
 * For Nuxt v3/v4 (Nitro v2, h3 v1).
 */
export const sentryCaptureErrorHook = createCaptureErrorHook(error =>
  error instanceof H3Error ? error.statusCode : undefined,
);
