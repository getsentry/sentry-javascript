import { GLOBAL_OBJ } from '@sentry/utils';
import { getSentryCarrier } from '../../src/carrier';

export function clearGlobalScope() {
  const carrier = getSentryCarrier(GLOBAL_OBJ);
  carrier.globalScope = undefined;
}
