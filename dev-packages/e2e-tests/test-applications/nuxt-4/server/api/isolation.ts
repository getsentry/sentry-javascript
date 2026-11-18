import * as Sentry from '@sentry/nuxt';
import { defineEventHandler, getQuery } from '#imports';

export default defineEventHandler(async event => {
  const tag = String(getQuery(event).tag);
  Sentry.setTag('isolation-tag', tag);

  // Lets the concurrent requests of the test set their tags before any of them captures its event.
  await new Promise(resolve => setTimeout(resolve, 200));

  Sentry.captureMessage(`isolation ${tag}`);
  return { tag };
});
