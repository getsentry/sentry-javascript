import type { ClientOptions } from '@sentry/core';
import { captureException, getClient } from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import { defineNuxtPlugin, isNuxtError } from 'nuxt/app';
import type { ComponentPublicInstance } from 'vue';

type CaughtVueError = {
  error: unknown;
  instance?: ComponentPublicInstance | null;
  info?: string;
};

// 3xx/4xx Nuxt errors are expected control flow (redirects, not-found pages), not bugs. The server skips them too.
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

  nuxtApp.hooks.hook('app:rendered', async () => {
    if (nuxtApp.payload?.error) {
      return;
    }

    if (caught.length === 0) {
      return;
    }

    const sentryClient = getClient();
    const sentryOptions = sentryClient
      ? (sentryClient.getOptions() as ClientOptions & { attachProps?: boolean })
      : null;

    for (const { error, instance, info } of caught) {
      const metadata: Record<string, unknown> = {
        info,
      };

      if (instance?.$props && sentryOptions?.attachProps !== false && instance.$props !== false) {
        metadata.propsData = instance.$props;
      }

      captureException(error, {
        captureContext: { contexts: { nuxt: metadata } },
        mechanism: { handled: false, type: `auto.function.nuxt.${instance ? 'vue' : 'app'}-error` },
      });
    }

    caught.length = 0;

    await flushIfServerless();
  });
});
