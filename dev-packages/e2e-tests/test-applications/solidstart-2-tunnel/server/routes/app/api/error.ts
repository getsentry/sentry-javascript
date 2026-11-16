import { defineHandler } from 'nitro/h3';

// A Nitro route, since Sentry captures no errors of SolidStart API routes. Nitro serves it without Vite's `base`.
export default defineHandler(() => {
  throw new Error('Tunnel test error');
});
