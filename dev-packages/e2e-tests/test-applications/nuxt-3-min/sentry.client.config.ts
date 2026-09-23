import * as Sentry from '@sentry/nuxt';
import { useRuntimeConfig } from '#imports';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: useRuntimeConfig().public.sentry.dsn,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.vueIntegration({
      tracingOptions: {
        trackComponents: true,
      },
    }),
  ],
});
