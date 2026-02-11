import type { EnvelopeItemType } from '@sentry/core';
import { parseSemver } from '@sentry/core';
import type * as http from 'http';
import { describe } from 'vitest';

const NODE_VERSION = parseSemver(process.versions.node).major;

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
  if (!NODE_VERSION) {
    return describe.skip;
  }

  return NODE_VERSION < (allowedVersion.min || -Infinity) || NODE_VERSION > (allowedVersion.max || Infinity)
    ? describe.skip
    : describe;
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
