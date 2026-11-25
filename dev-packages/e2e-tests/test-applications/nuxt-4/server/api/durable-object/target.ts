import { defineEventHandler } from '#imports';

export default defineEventHandler(event => {
  return { durable: !!(event.context.cloudflare as { durable?: unknown } | undefined)?.durable };
});
