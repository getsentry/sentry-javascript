import { defineNuxtPlugin, isNuxtError } from 'nuxt/app';
import type { ComponentPublicInstance } from 'vue';
import { reportNuxtError } from '../utils';

type CaughtVueError = {
  error: unknown;
  instance?: ComponentPublicInstance | null;
  info?: string;
};

function isIgnoredNuxtError(error: unknown): boolean {
  if (!isNuxtError(error)) {
    return false;
  }
  // oxlint-disable-next-line typescript/no-deprecated
  const statusCode = error?.status || error?.statusCode;
  return !!statusCode && statusCode >= 300 && statusCode < 500;
}

export default defineNuxtPlugin(nuxtApp => {
  const caught: CaughtVueError[] = [];

  nuxtApp.hooks.hook('vue:error', (error: unknown, instance: ComponentPublicInstance | null, info: string) => {
    if (isIgnoredNuxtError(error)) {
      return;
    }

    caught.push({ error, instance, info });
  });

  nuxtApp.hooks.hook('app:rendered', () => {
    if (nuxtApp.payload?.error) {
      return;
    }

    for (const { error, instance, info } of caught) {
      reportNuxtError({ error, instance, info });
    }

    caught.length = 0;
  });
});
