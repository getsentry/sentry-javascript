import { withSentryConfig } from '@sentry/nitro';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __E2E_TEST_TUNNEL__: JSON.stringify(!!process.env.E2E_TEST_TUNNEL),
    __E2E_TEST_BASE_PATH__: JSON.stringify(process.env.E2E_TEST_BASE_PATH ?? ''),
  },
  plugins: [
    nitro(
      // FIXME: Nitro plugin has a type issue
      // @ts-expect-error
      withSentryConfig({
        serverDir: './server',
        ...(process.env.E2E_TEST_BASE_PATH && { baseURL: `${process.env.E2E_TEST_BASE_PATH}/` }),
        // Without static assets, global middleware or routed middleware, Nitro skips its middleware array whenever
        // route rules exist, as on serverless presets.
        ...(process.env.E2E_TEST_NO_MIDDLEWARE && {
          serveStatic: false,
          ignore: ['**/middleware/**'],
          routeRules: { '/api/**': { headers: { 'x-e2e-route-rule': '1' } } },
        }),
      }),
    ),
  ],
});
