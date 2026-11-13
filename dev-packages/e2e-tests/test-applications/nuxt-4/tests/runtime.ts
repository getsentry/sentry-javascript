import { getRuntime } from '@sentry-internal/test-utils';

export const RUNTIME = getRuntime();

export const NO_PROCESS = 'Cloudflare: the Worker is no process the tests can start with a preload or watch exit';

// Without Sentry too, the Cloudflare preset of Nitro allows no externals and fails the build on the optional
// `require()`s of the `mongodb` driver (for example `@aws-sdk/credential-providers`).
export const MONGOOSE_UNSUPPORTED = 'Cloudflare: Nitro cannot bundle the `mongodb` driver for Workers';

export const SERVER_ORIGIN = RUNTIME === 'cloudflare' ? 'auto.http.cloudflare' : 'auto.http.http_server';

// The Cloudflare variant builds without `sentry.server.config.ts`, as the Cloudflare setup of `@sentry/nuxt` documents.
// The module adds the db0, storage, cache and middleware instrumentation only with that file.
export const NO_SERVER_CONFIG_INSTRUMENTATION =
  'Cloudflare: `@sentry/nuxt` instruments db0, storage, cache and middleware only with a `sentry.server.config.ts`';

/** The command and arguments that start the built server on the runtime of the variant. */
export function getServerCommand(preload?: string): [string, string[]] {
  const entry = '.output/server/index.mjs';

  if (RUNTIME === 'bun') {
    return ['bun', preload ? ['--preload', preload, entry] : [entry]];
  }

  if (RUNTIME === 'deno') {
    return ['deno', ['run', '-A', ...(preload ? [`--preload=${preload}`] : []), entry]];
  }

  return ['node', preload ? ['--import', preload, entry] : [entry]];
}
