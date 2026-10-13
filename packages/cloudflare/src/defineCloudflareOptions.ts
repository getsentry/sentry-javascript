import type { CloudflareOptions } from './client';
import type { DefaultEnv, StrictCloudflareOptions } from './types';

/**
 * Define the Sentry options for a Cloudflare Worker in a dedicated module.
 *
 * This is the recommended way to configure the SDK when using the Vite plugin's
 * auto-instrumentation: place an `instrument.server.{ts,js,mjs}` file next to
 * the worker entry whose **default export** is the result of this function. The
 * plugin picks it up automatically and hands it to `withSentry`.
 *
 * Unlike Node's `Sentry.init(...)`, the options cannot be applied at module
 * load time on Cloudflare: the DSN and other settings typically come from the
 * per-request `env`, which only exists inside the handler. Pass a callback to
 * read from `env`, or a static object when no `env` access is needed — either
 * way you get full type-checking and autocomplete on {@link CloudflareOptions}.
 *
 * At runtime this is a thin pass-through; it only normalizes a static object
 * into a callback so the plugin always imports a `(env) => options` function.
 *
 * @example
 * ```ts
 * // src/instrument.server.ts
 * import { defineCloudflareOptions } from '@sentry/cloudflare';
 *
 * export default defineCloudflareOptions((env) => ({
 *   dsn: env.SENTRY_DSN,
 *   tracesSampleRate: 1.0,
 * }));
 * ```
 *
 * @example
 * ```ts
 * // Static options — no `env` access needed
 * export default defineCloudflareOptions({ tracesSampleRate: 1.0 });
 * ```
 */
// Overloads rather than a union parameter: TypeScript does not infer `O` out of a union member,
// so a union signature falls back to the default and the unknown-key check never runs. The object
// overload stays on plain `CloudflareOptions` — a direct object literal is still excess property
// checked, and a callback cannot match it.
export function defineCloudflareOptions<Env = DefaultEnv, O = unknown>(
  callback: (env: Env) => StrictCloudflareOptions<O> | undefined,
): (env: Env) => CloudflareOptions | undefined;
export function defineCloudflareOptions<Env = DefaultEnv>(
  options: CloudflareOptions,
): (env: Env) => CloudflareOptions | undefined;
export function defineCloudflareOptions<Env = DefaultEnv>(
  optionsOrCallback: CloudflareOptions | ((env: Env) => CloudflareOptions | undefined),
): (env: Env) => CloudflareOptions | undefined {
  if (typeof optionsOrCallback === 'function') {
    return optionsOrCallback;
  }

  return () => optionsOrCallback;
}
