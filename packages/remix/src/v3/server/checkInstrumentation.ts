import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { consoleSandbox, GLOBAL_OBJ, parseSemver } from '@sentry/core';
import { remixV3Config } from '@sentry/server-utils/orchestrion/config';

const IMPORT_HINT = 'Start Node with `--import @sentry/remix/v3/node`.';

// Every Remix 3 server app creates a router, so this module decides whether the hook was in place.
// The other packages cannot be checked the same way: `remix` depends on all of them, so they look
// installed whether or not the app imports them.
const ANCHOR_MODULE = '@remix-run/fetch-router';

const warned = new Set<string>();

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** An always-on warning, deduplicated by message. A user who sees no data will not have `debug` on. */
export function warnRemixV3(message: string): void {
  if (warned.has(message)) {
    return;
  }
  warned.add(message);
  consoleSandbox(() => {
    // oxlint-disable-next-line no-console
    console.warn(`[Sentry] ${message}`);
  });
}

/**
 * Warn when the Remix 3 router module did not go through the runtime hook, with the reason.
 *
 * A module the hook transformed is listed in `__SENTRY_ORCHESTRION__.runtime`. One that is installed
 * but not listed was either imported before the hook was registered, or is outside the version range
 * the transform matches. Nothing is reported when it is not installed: the app does not use Remix 3.
 */
export function checkRemixV3Instrumentation(getInstalledVersion = readInstalledVersion): void {
  const marker = GLOBAL_OBJ.__SENTRY_ORCHESTRION__;

  if (marker?.runtimeUnavailable) {
    warnRemixV3(`Remix 3 is not instrumented: the module hook could not be registered on Node ${process.version}.`);
    return;
  }

  if (marker?.runtime?.includes(ANCHOR_MODULE)) {
    return;
  }

  const version = getInstalledVersion(ANCHOR_MODULE);
  if (version === undefined) {
    return;
  }

  const range = getVersionRange(ANCHOR_MODULE);
  if (range && !isInRange(version, range)) {
    warnRemixV3(`Remix 3 is not instrumented: ${ANCHOR_MODULE}@${version} is outside the supported range ${range}.`);
    return;
  }

  warnRemixV3(
    `Remix 3 is not instrumented: ${ANCHOR_MODULE} was imported before the Sentry module hook was registered. ${IMPORT_HINT}`,
  );
}

function getVersionRange(name: string): string | undefined {
  return remixV3Config.find(config => config.module.name === name)?.module.versionRange;
}

/** Only the `>=a.b.c <d` form the Remix 3 config uses. Anything else counts as matching. */
function isInRange(version: string, range: string): boolean {
  const match = range.match(/^>=(\d+)\.(\d+)\.(\d+) <(\d+)$/);
  const { major, minor, patch } = parseSemver(version);
  if (!match || major === undefined || minor === undefined || patch === undefined) {
    return true;
  }
  const [, minMajor = '0', minMinor = '0', minPatch = '0', maxMajor = '0'] = match;
  const atLeastMin =
    major > Number(minMajor) ||
    (major === Number(minMajor) &&
      (minor > Number(minMinor) || (minor === Number(minMinor) && patch >= Number(minPatch))));
  return atLeastMin && major < Number(maxMajor);
}

/**
 * The version of a Remix 3 package as the app resolves it, or `undefined` when it is not installed.
 * Looked up from the `remix` package's real location: under pnpm the `@remix-run/*` packages are only
 * reachable from there, and resolving from the app would find a hoisted copy of a different version.
 * A plain `node_modules` walk rather than `require.resolve`, because `remix` exports no `package.json`.
 */
export function readInstalledVersion(name: string, fromDir = process.cwd()): string | undefined {
  try {
    const remixPackageJson = findPackageJson('remix', fromDir);
    if (!remixPackageJson) {
      return undefined;
    }
    const packageJson = findPackageJson(name, dirname(realpathSync(remixPackageJson)));
    if (!packageJson) {
      return undefined;
    }
    const { version } = JSON.parse(readFileSync(packageJson, 'utf8')) as { version?: unknown };
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

function findPackageJson(name: string, fromDir: string): string | undefined {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
