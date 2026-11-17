import { GLOBAL_OBJ, parseSemver } from '@sentry/core';

type GlobalWithRuntimes = typeof GLOBAL_OBJ & { Bun?: { version?: string }; Deno?: unknown };

/** Whether the SDK runs in Bun. */
export function isBun(): boolean {
  return typeof (GLOBAL_OBJ as GlobalWithRuntimes).Bun !== 'undefined';
}

/**
 * Whether the SDK runs in a Bun version that can instrument modules in `bun run`.
 * Before Bun 1.4.5, a CommonJS module returned by a runtime `onLoad` plugin
 * loses its named exports, so the instrumented modules fail to load.
 * See https://github.com/oven-sh/bun/issues/19279
 */
export function isBunRuntimeInstrumentationSupported(): boolean {
  const version = (GLOBAL_OBJ as GlobalWithRuntimes).Bun?.version;
  if (!version) {
    return false;
  }
  const { major = 0, minor = 0, patch = 0 } = parseSemver(version);
  return major > 1 || (major === 1 && (minor > 4 || (minor === 4 && patch >= 5)));
}

/** Whether the SDK runs in Deno. */
export function isDeno(): boolean {
  return typeof (GLOBAL_OBJ as GlobalWithRuntimes).Deno !== 'undefined';
}

/** Whether the SDK runs in Cloudflare Workers. */
export function isCloudflareWorkers(): boolean {
  return GLOBAL_OBJ.navigator?.userAgent === 'Cloudflare-Workers';
}
