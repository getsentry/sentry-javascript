import { GLOBAL_OBJ } from '@sentry/core';

/** Detect CommonJS. */
export function isCjs(): boolean {
  // @ts-expect-error Require is not defined on global obj
  return !!GLOBAL_OBJ.require;
}
