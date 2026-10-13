import { defineEventHandler } from '#imports';
import * as Sentry from '@sentry/nuxt';

export default defineEventHandler(() => {
  Sentry.logger.info('nuxt-4 server log', { 'e2e.attr': 'value' });
  return { logged: true };
});
