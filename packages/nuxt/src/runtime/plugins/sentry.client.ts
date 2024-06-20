import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { init } from '../../client';

export default defineNuxtPlugin(nuxtApp => {
  const config = useRuntimeConfig();
  const sentryConfig = config.public.sentry || {};

  init({
    ...sentryConfig,
    app: nuxtApp.vueApp,
  });
});
