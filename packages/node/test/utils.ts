import { NODE_VERSION } from '../src/nodeVersion';

/**
 * Returns`describe` or `describe.skip` depending on allowed major versions of Node.
 *
 * @param {{ min?: number; max?: number }} allowedVersion
 * @return {*}  {jest.Describe}
 */
export const conditionalTest = (allowedVersion: { min?: number; max?: number }): jest.Describe => {
  if (!NODE_VERSION.major) {
    return describe.skip as jest.Describe;
  }

  return NODE_VERSION < (allowedVersion.min || -Infinity) || NODE_VERSION > (allowedVersion.max || Infinity)
    ? (describe.skip as jest.Describe)
    : (describe as any);
};
