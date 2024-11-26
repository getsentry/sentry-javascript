import { getSentryCarrier } from '../../src/carrier';
import { GLOBAL_OBJ } from '../../src/utils-hoist/worldwide';

export function clearGlobalScope() {
  const carrier = getSentryCarrier(GLOBAL_OBJ);
  carrier.globalScope = undefined;
}
