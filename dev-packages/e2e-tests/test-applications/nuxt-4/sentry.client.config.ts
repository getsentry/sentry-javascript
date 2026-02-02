import * as Sentry from '@sentry/nuxt';
import { usePinia, useRuntimeConfig } from '#imports';

Sentry.init({
  dsn: useRuntimeConfig().public.sentry.dsn,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.piniaIntegration(usePinia(), {
      actionTransformer: action => `${action}.transformed`,
      stateTransformer: state => ({
        transformed: true,
        ...state,
      }),
    }),
    Sentry.vueIntegration({
      tracingOptions: {
        trackComponents: true,
      },
    }),
  ],
});
