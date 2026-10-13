import { getRuntime } from '@sentry-internal/test-utils';

export const RUNTIME = getRuntime();

// Node and Deno get the `http.server` span from the HTTP integration of the Node SDK. On Bun, `bunHttpServerIntegration`
// creates it with the shared core instrumentation, and on Cloudflare `@sentry/cloudflare` creates it.
export const HTTP_SERVER_ORIGIN = {
  node: 'auto.http.http_server',
  deno: 'auto.http.http_server',
  bun: 'auto.http.server',
  cloudflare: 'auto.http.cloudflare',
}[RUNTIME];

// On Cloudflare, the databases use D1, and `@sentry/cloudflare` instruments their bindings instead of the database
// instrumentation of Nuxt.
export const DB_SYSTEM_NAME = RUNTIME === 'cloudflare' ? 'cloudflare-d1' : 'sqlite';
export const DB_ORIGIN = RUNTIME === 'cloudflare' ? 'auto.db.cloudflare.d1' : 'auto.db.nuxt';
