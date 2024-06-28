import { getClient } from '@sentry/core';
import { vueIntegration } from '@sentry/vue';
import { defineNuxtPlugin } from 'nuxt/app';

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.hook('app:created', vueApp => {
    const sentryClient = getClient();

    if (sentryClient) {
      sentryClient.addIntegration(vueIntegration({ app: vueApp }));
    }
  });
});
