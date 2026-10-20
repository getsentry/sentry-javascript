import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Deno throws `NotCapable` on any `process.env` access when the app has no env permission. The Deno
 * SDK imports this package from `init()`, so loading it and registering the hooks must not touch
 * `process.env`. The vendored dependencies are the risk here, so this runs on the built files.
 */
const buildDir = join(__dirname, '..', 'build');

// Stands in for Deno's permission check. Node's own loader reads `process.env` too, even while it
// loads a file that one of ours required, so only reads whose direct caller is one of this
// package's built files throw. Stack lines: the `Error` line, this trap, then the caller.
const lockEnv = `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const env = process.env;
const guard = trap => (...args) => {
  if (new Error().stack.split('\\n')[2].includes(${JSON.stringify(buildDir)})) {
    throw new Error('process.env access denied');
  }
  return Reflect[trap](env, ...args.slice(1));
};
const traps = Object.fromEntries(['get', 'has', 'ownKeys', 'getOwnPropertyDescriptor', 'set'].map(t => [t, guard(t)]));
Object.defineProperty(process, 'env', { value: new Proxy(env, traps) });
`;

describe.each([
  ['cjs', `require(${JSON.stringify(join(buildDir, 'cjs', 'register.js'))})`],
  ['esm', `await import(${JSON.stringify(pathToFileURL(join(buildDir, 'esm', 'register.js')).href)})`],
])('the %s build', (_variant, load) => {
  it('loads and registers without reading process.env', { timeout: 30_000 }, () => {
    const script = `${lockEnv}
const { registerDiagnosticsChannelInjection } = ${load};
registerDiagnosticsChannelInjection();
console.log(JSON.stringify(globalThis.__SENTRY_ORCHESTRION__));
`;

    const out = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(JSON.parse(out.trim())).toEqual({ runtime: [] });
  });
});
