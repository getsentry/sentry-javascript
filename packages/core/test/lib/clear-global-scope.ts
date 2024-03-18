import { GLOBAL_OBJ } from '@sentry/utils';

export function clearGlobalScope() {
  const __SENTRY__ = (GLOBAL_OBJ.__SENTRY__ = GLOBAL_OBJ.__SENTRY__ || {});
  __SENTRY__.globalScope = undefined;
}
