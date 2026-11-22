import { getRuntime } from '@sentry-internal/test-utils';

export const RUNTIME = getRuntime();

export const NO_PROCESS = 'Cloudflare: the Worker is no process the tests can start or watch exit';

// Without Sentry too, the Cloudflare preset of Nitro cannot bundle the `mongodb` driver for Workers.
export const MONGOOSE_UNSUPPORTED = 'Cloudflare: Nitro cannot bundle the `mongodb` driver for Workers';

// Nitro 3 serves with `Bun.serve` on Bun and with `node:http` on Node and Deno.
const SERVER_ORIGINS = {
  node: 'auto.http.http_server',
  bun: 'auto.http.bun.serve',
  deno: 'auto.http.http_server',
  cloudflare: 'auto.http.cloudflare',
};

export const SERVER_ORIGIN = SERVER_ORIGINS[RUNTIME];

// On Cloudflare, the databases are D1 databases. `@sentry/cloudflare` creates the spans of their queries, and
// `@sentry/nuxt` leaves them out of its database instrumentation.
export const DB_SYSTEM_NAME = RUNTIME === 'cloudflare' ? 'cloudflare-d1' : 'sqlite';
export const DB_ORIGIN = RUNTIME === 'cloudflare' ? 'auto.db.cloudflare.d1' : 'auto.db.nuxt';

/** The command and arguments that start the built server on the runtime of the variant. */
export function getServerCommand(): [string, string[]] {
  const entry = '.output/server/index.mjs';

  if (RUNTIME === 'bun') {
    return ['bun', [entry]];
  }

  if (RUNTIME === 'deno') {
    return ['deno', ['run', '-A', entry]];
  }

  return ['node', [entry]];
}
