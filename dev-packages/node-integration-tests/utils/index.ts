import type { EnvelopeItemType } from '@sentry/core';
import { parseSemver } from '@sentry/core';
import { execFileSync } from 'child_process';
import type * as http from 'http';

export const NODE_VERSION = parseSemver(process.versions.node).major || 0;

/**
 * The runtime that runs the scenarios (`node`, `bun` or `deno`), from the `RUNTIME` env var.
 */
export type Runtime = 'cloudflare' | 'node' | 'bun' | 'deno';
export const RUNTIME = (process.env.RUNTIME || 'node') as Runtime;

// Vitest runs on Node, so it cannot read `Bun.version` of the `bun` binary that runs the scenarios.
const BUN_VERSION = RUNTIME === 'bun' ? execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim() : undefined;

/**
 * The `sdk.name` the scenarios send. It is `sentry.javascript.node`, unless a runtime package
 * maps `@sentry/node` to its own SDK and sets the `EXPECTED_SDK_NAME` env var to that SDK's name.
 */
export const EXPECTED_SDK_NAME = process.env.EXPECTED_SDK_NAME || 'sentry.javascript.node';

export type TestServerConfig = {
  url: string;
  server: http.Server;
};

export type DataCollectorOptions = {
  // Optional custom URL
  url?: string;

  // The expected amount of requests to the envelope endpoint.
  // If the amount of sent requests is lower than `count`, this function will not resolve.
  count?: number;

  // The method of the request.
  method?: 'get' | 'post';

  // Whether to stop the server after the requests have been intercepted
  endServer?: boolean;

  // Type(s) of the envelopes to capture
  envelopeType?: EnvelopeItemType | EnvelopeItemType[];
};

export type Requirements = {
  /** Lowest Node major version that runs the tests. */
  min?: number;
  /** Highest Node major version that runs the tests. */
  max?: number;
  /** Lowest Bun version that runs the tests, for tests that fail on the oldest Bun version in CI. */
  bunMin?: string;
  /** Runtimes that run the tests. All runtimes run them when this is not set. */
  runtimes?: Runtime[];
};

/**
 * Whether the Node version, the runtime and the Bun version that run the scenarios meet the
 * requirements of the tests, for use in `test.runIf` and `describe.runIf`.
 *
 * On Bun and Deno the Node version requirement does not apply. A suite that cannot run on a Node
 * version must also be excluded for these runtimes, in
 * `dev-packages/bun-integration-tests/node-suites/excludes.ts` and
 * `dev-packages/deno-integration-tests/node-suites/excludes.ts`, or limited with `runtimes`.
 */
export function supports(requirements: Requirements): boolean {
  if (requirements.runtimes && !requirements.runtimes.includes(RUNTIME)) {
    return false;
  }
  if (RUNTIME === 'bun') {
    return !requirements.bunMin || !isBunOlderThan(requirements.bunMin);
  }
  // Vitest always runs on Node, so its Node version says nothing about Bun or Deno running the
  // scenario. Those runtimes list the suites they cannot run in their own exclude lists.
  if (RUNTIME !== 'node') {
    return true;
  }
  return matchesNodeVersion(requirements);
}

function matchesNodeVersion({ min, max }: { min?: number; max?: number }): boolean {
  if (!NODE_VERSION) {
    return false;
  }

  return !(NODE_VERSION < (min || -Infinity) || NODE_VERSION > (max || Infinity));
}

function isBunOlderThan(version: string): boolean {
  if (!BUN_VERSION) {
    return false;
  }

  const current = parseSemver(BUN_VERSION);
  const required = parseSemver(version);
  const difference =
    (current.major || 0) - (required.major || 0) ||
    (current.minor || 0) - (required.minor || 0) ||
    (current.patch || 0) - (required.patch || 0);

  return difference < 0;
}

/**
 * Parses response body containing an Envelope
 *
 * @param {string} body
 * @return {*}  {Array<Record<string, unknown>>}
 */
export const parseEnvelope = (body: string): Array<Record<string, unknown>> => {
  return body.split('\n').map(e => JSON.parse(e));
};

/**
 * Narrows a typed span attribute value to a string.
 *
 * Streamed span attribute values are a union (`string | number | boolean | string[] | ...`), so
 * assertions that call string methods (`includes`, `startsWith`, `match`, `length`) need the value
 * narrowed first. Returns `undefined` if the value is not a string.
 */
export function getStringAttributeValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
