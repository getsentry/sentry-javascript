import type { NitroAppPlugin } from 'nitro/types';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';

/**
 * Nitro plugin that reports server errors to Sentry for Nuxt v5+ (Nitro v3+)
 */
export default (nitroApp => {
  // @ts-expect-error Nitro v3 hands the `error` hook an `HTTPEvent`, Nitro v2 an `H3Event`
  nitroApp.hooks.hook('error', sentryCaptureErrorHook);
}) satisfies NitroAppPlugin;
