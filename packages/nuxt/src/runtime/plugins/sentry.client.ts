import * as Sentry from '@sentry/vue';
import { defineNuxtPlugin } from 'nuxt/app';

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.hook('app:created', vueApp => {
    Sentry.addIntegration(Sentry.vueIntegration({ app: vueApp }));
  });
});
