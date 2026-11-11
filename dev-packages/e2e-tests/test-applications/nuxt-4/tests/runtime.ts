import { getRuntime } from '@sentry-internal/test-utils';

export const RUNTIME = getRuntime();

export const NO_PROCESS = 'Cloudflare: the Worker is no process the tests can start with a preload or watch exit';

// Without Sentry too, the Cloudflare preset of Nitro allows no externals and fails the build on the optional
// `require()`s of the `mongodb` driver (for example `@aws-sdk/credential-providers`).
export const MONGOOSE_UNSUPPORTED = 'Cloudflare: Nitro cannot bundle the `mongodb` driver for Workers';

export const SERVER_ORIGIN = RUNTIME === 'cloudflare' ? 'auto.http.cloudflare' : 'auto.http.http_server';

/** `db.namespace` of a db0 span: Nitro names the SQLite file after the database, while a D1 binding names none. */
export function dbNamespaceAttribute(name: string): { 'db.namespace'?: { type: string; value: string } } {
  return RUNTIME === 'cloudflare' ? {} : { 'db.namespace': { type: 'string', value: `${name}.sqlite` } };
}

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
