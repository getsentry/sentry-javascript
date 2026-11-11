import * as Sentry from '@sentry/nuxt';
import { defineEventHandler } from '#imports';

export default defineEventHandler(() => {
  Sentry.captureMessage('trace continuation');
  return { ok: true };
});
