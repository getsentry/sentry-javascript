import { defineEventHandler } from '#imports';
import * as Sentry from '@sentry/nuxt';

export default defineEventHandler(() => {
  // Seed a pending client-report outcome without sending an event, so the test can observe whether the
  // SDK wrongly flushes (and ships) it per HTTP response instead of aggregating it.
  Sentry.getClient()?.recordDroppedEvent('before_send', 'error');
  return { seeded: true };
});
