import { it } from 'vitest';
import { getSentryCarrier } from '../src/carrier';
import { GLOBAL_OBJ } from '../src/utils/worldwide';

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

export function clearGlobalScope() {
  const carrier = getSentryCarrier(GLOBAL_OBJ);
  carrier.globalScope = undefined;
}
