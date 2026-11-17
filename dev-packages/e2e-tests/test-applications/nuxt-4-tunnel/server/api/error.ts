import { defineEventHandler } from '#imports';

export default defineEventHandler(() => {
  throw new Error('Tunnel test error');
});
