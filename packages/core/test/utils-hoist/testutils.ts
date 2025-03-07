import { it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/ban-types
export const testOnlyIfNodeVersionAtLeast = (minVersion: number): Function => {
  const currentNodeVersion = process.env.NODE_VERSION;

  try {
    if (Number(currentNodeVersion?.split('.')[0]) < minVersion) {
      return it.skip;
    }
  } catch (oO) {
    // we can't tell, so err on the side of running the test
  }

  return it;
};
