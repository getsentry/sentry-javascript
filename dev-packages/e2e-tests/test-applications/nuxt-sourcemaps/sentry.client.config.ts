import * as Sentry from '@sentry/nuxt';
import { useRuntimeConfig } from '#imports';

Sentry.init({
  dsn: useRuntimeConfig().public.sentry.dsn,
});
