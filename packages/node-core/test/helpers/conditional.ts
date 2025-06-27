import { parseSemver } from '@sentry/core';
import { it, test } from 'vitest';

const NODE_VERSION = parseSemver(process.versions.node).major;

/**
 * Returns`describe` or `describe.skip` depending on allowed major versions of Node.
 *
 * @param {{ min?: number; max?: number }} allowedVersion
 */
export const conditionalTest = (allowedVersion: { min?: number; max?: number }) => {
  if (!NODE_VERSION) {
    return it.skip;
  }

  return NODE_VERSION < (allowedVersion.min || -Infinity) || NODE_VERSION > (allowedVersion.max || Infinity)
    ? test.skip
    : test;
};
