import { it } from 'vitest';
import { getMainCarrier } from '../src/carrier';

// eslint-disable-next-line @typescript-eslint/ban-types
export const testOnlyIfNodeVersionAtLeast = (minVersion: number): Function => {
  const currentNodeVersion = process.env.NODE_VERSION;

  try {
    if (Number(currentNodeVersion?.split('.')[0]) < minVersion) {
      return it.skip;
    }
  } catch {
    // we can't tell, so err on the side of running the test
  }

  return it;
};

export function resetGlobals(): void {
  getMainCarrier().__SENTRY__ = undefined;
}
