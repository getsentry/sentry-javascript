import { GLOBAL_OBJ } from '@sentry/core';

/** Global flag set by the generated `<buildDir>/dev/sentry.server.config.mjs`. */
export const NUXT_DEV_MODE_FLAG = '__SENTRY_NUXT_DEV_MODE__';

/** Whether the SDK was preloaded by the generated `nuxt dev` server config file. */
export function isNuxtDevRuntime(): boolean {
  return NUXT_DEV_MODE_FLAG in GLOBAL_OBJ && GLOBAL_OBJ[NUXT_DEV_MODE_FLAG] === true;
}
