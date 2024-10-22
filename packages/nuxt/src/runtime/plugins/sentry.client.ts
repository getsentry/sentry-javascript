import { getClient } from '@sentry/core';
import { consoleSandbox } from '@sentry/utils';
import { browserTracingIntegration, createSentryPiniaPlugin, vueIntegration } from '@sentry/vue';
import { defineNuxtPlugin } from 'nuxt/app';
import { reportNuxtError } from '../utils';

// --- Types are copied from @sentry/vue (so it does not need to be exported) ---
// The following type is an intersection of the Route type from VueRouter v2, v3, and v4.
// This is not great, but kinda necessary to make it work with all versions at the same time.
type Route = {
  /** Unparameterized URL */
  path: string;
  /**
   * Query params (keys map to null when there is no value associated, e.g. "?foo" and to an array when there are
   * multiple query params that have the same key, e.g. "?foo&foo=bar")
   */
  query: Record<string, string | null | (string | null)[]>;
  /** Route name (VueRouter provides a way to give routes individual names) */
  name?: string | symbol | null | undefined;
  /** Evaluated parameters */
  params: Record<string, string | string[]>;
  /** All the matched route objects as defined in VueRouter constructor */
  matched: { path: string }[];
};

interface VueRouter {
  onError: (fn: (err: Error) => void) => void;
  beforeEach: (fn: (to: Route, from: Route, next?: () => void) => void) => void;
}

// Tree-shakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

export default defineNuxtPlugin({
  name: 'sentry-client-integrations',
  dependsOn: ['sentry-client-config'],
  async setup(nuxtApp) {
    const sentryClient = getClient();
    const clientOptions = sentryClient && sentryClient.getOptions();

    // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false", in which case everything inside
    // will get tree-shaken away
    if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
      if (sentryClient && '$router' in nuxtApp) {
        sentryClient.addIntegration(
          browserTracingIntegration({ router: nuxtApp.$router as VueRouter, routeLabel: 'path' }),
        );
      }
    }

    if (clientOptions && 'trackPinia' in clientOptions && clientOptions.trackPinia) {
      if ('$pinia' in nuxtApp) {
        (nuxtApp.$pinia as { use: (plugin: unknown) => void }).use(
          // `trackPinia` is an object with custom options or `true` (pass `undefined` to use default options)
          createSentryPiniaPlugin(clientOptions.trackPinia === true ? undefined : clientOptions.trackPinia),
        );
      } else {
        clientOptions.debug &&
          consoleSandbox(() => {
            // eslint-disable-next-line no-console
            console.warn(
              '[Sentry] You set `trackPinia`, but the Pinia module was not found. Make sure to add `"@pinia/nuxt"` to your modules array.',
            );
          });
      }
    }

    nuxtApp.hook('app:created', vueApp => {
      const sentryClient = getClient();

      if (sentryClient) {
        // Adding the Vue integration without the Vue error handler
        // Nuxt is registering their own error handler, which is unset after hydration: https://github.com/nuxt/nuxt/blob/d3fdbcaac6cf66d21e25d259390d7824696f1a87/packages/nuxt/src/app/entry.ts#L64-L73
        // We don't want to wrap the existing error handler, as it leads to a 500 error: https://github.com/getsentry/sentry-javascript/issues/12515
        sentryClient.addIntegration(vueIntegration({ app: vueApp, attachErrorHandler: false }));
      }
    });

    nuxtApp.hook('app:error', error => {
      reportNuxtError({ error });
    });

    nuxtApp.hook('vue:error', (error, instance, info) => {
      reportNuxtError({ error, instance, info });
    });
  },
});
