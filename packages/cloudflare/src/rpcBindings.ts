import type { CloudflareOptions } from './client';

/**
 * Adds binding names the Sentry Cloudflare Vite plugin resolved to *this* worker at build time to
 * the user's `enableRpcTracePropagation`.
 *
 * The plugin instruments those receivers itself, so appending trace metadata to RPC calls on them is
 * known-safe and needs no configuration. Anything the user configures is added on top; an explicit
 * `false` opts out of everything, including these bindings.
 *
 * @internal Called only by code the `@sentry/cloudflare/vite` auto-instrument transform generates.
 * @hidden
 */
export function _INTERNAL_withSameWorkerRpcBindings<E>(
  optionsCallback: (env: E) => CloudflareOptions | undefined,
  bindingNames: string[],
): (env: E) => CloudflareOptions | undefined {
  if (!bindingNames.length) {
    return optionsCallback;
  }

  return (env: E) => {
    const options = optionsCallback(env);
    const configured = options?.enableRpcTracePropagation;

    if (typeof configured === 'boolean') {
      return options;
    }

    return {
      ...options,
      enableRpcTracePropagation: configured ? [...bindingNames, ...configured] : bindingNames,
    };
  };
}
