import { GLOBAL_OBJ } from './worldwide';

// On the global object, because `@sentry/nitro`'s build-time module and the SDK that `--import` loads can each
// have their own copy of the SDK packages.
type GlobalWithNitroDevServer = typeof GLOBAL_OBJ & {
  __SENTRY_NITRO_DEV_SERVER__?: boolean;
};

/**
 * Marks this process as Nitro's dev server, which passes each request on to a worker that runs Nitro and
 * traces the request.
 */
export function setIsNitroDevServer(): void {
  (GLOBAL_OBJ as GlobalWithNitroDevServer).__SENTRY_NITRO_DEV_SERVER__ = true;
}

/**
 * Whether this process is Nitro's dev server, see {@link setIsNitroDevServer}. Its incoming requests get no
 * spans, because the worker creates them.
 */
export function isNitroDevServer(): boolean {
  return !!(GLOBAL_OBJ as GlobalWithNitroDevServer).__SENTRY_NITRO_DEV_SERVER__;
}
