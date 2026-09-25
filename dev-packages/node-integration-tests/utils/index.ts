import type { EnvelopeItemType } from '@sentry/core';
import { parseSemver } from '@sentry/core';
import type * as http from 'http';
import { describe } from 'vitest';

export const NODE_VERSION = parseSemver(process.versions.node).major || 0;

/**
 * The runtime that runs the scenarios (`node`, `bun` or `deno`), from the `RUNTIME` env var.
 * Tests use it in `test.skipIf` for behavior that a runtime does not support.
 */
export type Runtime = 'cloudflare' | 'node' | 'bun' | 'deno';
export const RUNTIME = (process.env.RUNTIME || 'node') as Runtime;

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

/**
 * Returns`describe` or `describe.skip` depending on allowed major versions of Node.
 *
 * @param {{ min?: number; max?: number }} allowedVersion
 */
export function conditionalTest(allowedVersion: {
  min?: number;
  max?: number;
}): typeof describe | typeof describe.skip {
  return describe.skipIf(!matchesNodeVersion(allowedVersion));
}

function matchesNodeVersion({ min, max }: { min?: number; max?: number }): boolean {
  if (!NODE_VERSION) {
    return false;
  }

  return !(NODE_VERSION < (min || -Infinity) || NODE_VERSION > (max || Infinity));
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
