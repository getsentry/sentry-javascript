import { parseSemver } from '@sentry/utils';

export const NODE_VERSION = parseSemver(process.versions.node) as { major: number; minor: number; patch: number };

/**
 * Returns`describe` or `describe.skip` depending on allowed major versions of Node.
 *
 * @param {{ min?: number; max?: number }} allowedVersion
 * @return {*}  {jest.Describe}
 */
export const conditionalTest = (allowedVersion: { min?: number; max?: number }): jest.Describe => {
  const major = NODE_VERSION.major;
  if (!major) {
    return describe.skip as jest.Describe;
  }

  return major < (allowedVersion.min || -Infinity) || major > (allowedVersion.max || Infinity)
    ? (describe.skip as jest.Describe)
    : (describe as any);
};
