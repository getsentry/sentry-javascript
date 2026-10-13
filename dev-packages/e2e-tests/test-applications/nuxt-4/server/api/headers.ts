import { defineEventHandler, getHeader } from '#imports';

export default defineEventHandler(event => {
  return {
    sentryTrace: getHeader(event, 'sentry-trace') ?? null,
    baggage: getHeader(event, 'baggage') ?? null,
  };
});
