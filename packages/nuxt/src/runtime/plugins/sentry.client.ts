import { getClient } from '@sentry/core';
import { browserTracingIntegration, vueIntegration } from '@sentry/vue';
import { defineNuxtPlugin } from 'nuxt/app';

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

export default defineNuxtPlugin(nuxtApp => {
  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false", in which case everything inside
  // will get tree-shaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    const sentryClient = getClient();

    if (sentryClient && '$router' in nuxtApp) {
      sentryClient.addIntegration(
        browserTracingIntegration({ router: nuxtApp.$router as VueRouter, routeLabel: 'path' }),
      );
    }
  }

  nuxtApp.hook('app:created', vueApp => {
    const sentryClient = getClient();

    if (sentryClient) {
      sentryClient.addIntegration(vueIntegration({ app: vueApp }));
    }
  });
});
