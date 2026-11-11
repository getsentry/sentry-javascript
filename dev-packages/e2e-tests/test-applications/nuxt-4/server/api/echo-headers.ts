import { defineEventHandler, getHeader } from '#imports';

export default defineEventHandler(event => ({
  'sentry-trace': getHeader(event, 'sentry-trace'),
  baggage: getHeader(event, 'baggage'),
}));
