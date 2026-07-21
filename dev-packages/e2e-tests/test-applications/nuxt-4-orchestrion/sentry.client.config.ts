import * as Sentry from '@sentry/nuxt';
import { useRuntimeConfig } from '#imports';

Sentry.init({
  dsn: useRuntimeConfig().public.sentry.dsn,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});
