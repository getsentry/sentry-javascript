import * as Sentry from '@sentry/nuxt';
import { defineEventHandler } from '#imports';

export default defineEventHandler(() => {
  Sentry.logger.info('nuxt-4 server log', { 'e2e.attr': 'value' });
  return { ok: true };
});
