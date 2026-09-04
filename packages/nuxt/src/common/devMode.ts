import { GLOBAL_OBJ } from '@sentry/core';

/** Global flag set by the generated runtime-flags module before the Sentry server config evaluates. */
export const NUXT_DEV_MODE_FLAG = '__SENTRY_NUXT_DEV_MODE__';

/** Global flag set by the generated runtime-flags module during a prerender build. */
export const NUXT_PRERENDER_FLAG = '__SENTRY_NUXT_PRERENDER__';

/** Global flag set by the Nuxt server SDK after a successful `init`, to guard against a second init. */
export const NUXT_SERVER_INITIALIZED_FLAG = '__SENTRY_NUXT_SERVER_INITIALIZED__';

/** Whether the server runs in `nuxt dev`. */
export function isNuxtDevRuntime(): boolean {
  return NUXT_DEV_MODE_FLAG in GLOBAL_OBJ && GLOBAL_OBJ[NUXT_DEV_MODE_FLAG] === true;
}

/** Whether a Nuxt server SDK `init` already ran in this process. */
export function isNuxtServerInitialized(): boolean {
  return NUXT_SERVER_INITIALIZED_FLAG in GLOBAL_OBJ && GLOBAL_OBJ[NUXT_SERVER_INITIALIZED_FLAG] === true;
}

/** Records that the Nuxt server SDK initialized in this process. */
export function markNuxtServerInitialized(): void {
  (GLOBAL_OBJ as typeof GLOBAL_OBJ & { [NUXT_SERVER_INITIALIZED_FLAG]?: boolean })[NUXT_SERVER_INITIALIZED_FLAG] = true;
}
