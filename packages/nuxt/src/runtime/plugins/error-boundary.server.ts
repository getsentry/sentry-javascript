import { defineNuxtPlugin } from 'nuxt/app';
import { reportNuxtError } from '../utils';
import { isIgnoredNuxtError } from '../utils/isIgnoredNuxtError';

export default defineNuxtPlugin(nuxtApp => {
  const caught: Parameters<typeof reportNuxtError>[0][] = [];
  nuxtApp.hook('vue:error', (error, instance, info) => {
    if (!isIgnoredNuxtError(error)) caught.push({ error, instance, info });
  });
  // The Nitro `error` hook reports errors that end on the error page.
  nuxtApp.hook('app:rendered', () => {
    if (!nuxtApp.payload.error) caught.forEach(reportNuxtError);
  });
});
