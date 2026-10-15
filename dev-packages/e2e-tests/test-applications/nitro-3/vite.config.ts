import { withSentryConfig } from '@sentry/nitro';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __E2E_TEST_TUNNEL__: JSON.stringify(!!process.env.E2E_TEST_TUNNEL),
  },
  plugins: [
    nitro(
      // FIXME: Nitro plugin has a type issue
      // @ts-expect-error
      withSentryConfig({
        serverDir: './server',
      }),
    ),
  ],
});
