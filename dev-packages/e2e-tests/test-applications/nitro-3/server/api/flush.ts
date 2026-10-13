import { flush } from '@sentry/nitro';
import { defineHandler } from 'nitro/h3';

export default defineHandler(async () => {
  await flush();
  return { status: 'ok' };
});
