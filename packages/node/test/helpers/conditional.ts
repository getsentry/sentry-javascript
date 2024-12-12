import { parseSemver } from '@sentry/core';

const NODE_VERSION = parseSemver(process.versions.node).major;

/**
 * Returns`describe` or `describe.skip` depending on allowed major versions of Node.
 *
 * @param {{ min?: number; max?: number }} allowedVersion
 * @return {*}  {jest.Describe}
 */
export const conditionalTest = (allowedVersion: { min?: number; max?: number }): jest.It => {
  if (!NODE_VERSION) {
    return it.skip;
  }

  return NODE_VERSION < (allowedVersion.min || -Infinity) || NODE_VERSION > (allowedVersion.max || Infinity)
    ? test.skip
    : test;
};
