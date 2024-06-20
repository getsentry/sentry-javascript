import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { init } from '../../client';

export default defineNuxtPlugin(nuxtApp => {
  const config = useRuntimeConfig();

  // eslint-disable-next-line no-console
  console.log('Plugin initialized');

  const sentryConfig = config.public.sentry || {};

  init({
    ...sentryConfig,
    app: nuxtApp.vueApp,
  });
});
