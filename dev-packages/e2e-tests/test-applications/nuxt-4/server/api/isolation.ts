import { defineEventHandler, getQuery } from '#imports';
import * as Sentry from '@sentry/nuxt';

export default defineEventHandler(async event => {
  const tag = String(getQuery(event).tag);
  Sentry.setTag('isolation-tag', tag);

  // Keeps concurrent requests in the handler at the same time, so a tag that leaks to another request ends up on the
  // wrong error.
  await new Promise(resolve => setTimeout(resolve, 100));

  Sentry.captureException(new Error(`Isolation error ${tag}`));

  return { tag };
});
