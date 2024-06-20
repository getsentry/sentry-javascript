import { applySdkMetadata } from '@sentry/core';
import * as Sentry from '@sentry/vue';
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';

export default defineNuxtPlugin(nuxtApp => {
  const config = useRuntimeConfig();

  // eslint-disable-next-line no-console
  console.log('Plugin initialized');

  const sentryConfig = config.public.sentry || {};

  applySdkMetadata(sentryConfig, 'nuxt', ['nuxt', 'vue']);

  Sentry.init({
    ...sentryConfig,
    app: nuxtApp.vueApp,
  });
});
