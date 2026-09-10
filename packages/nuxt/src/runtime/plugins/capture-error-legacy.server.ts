import type { NitroAppPlugin } from 'nitropack';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook-legacy';

/**
 * Nitro plugin that reports server errors to Sentry for Nuxt v3/v4 (Nitro v2)
 */
export default (nitroApp => {
  nitroApp.hooks.hook('error', sentryCaptureErrorHook);
}) satisfies NitroAppPlugin;
