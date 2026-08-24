import type { CloudflareOptions } from '@sentry/cloudflare';
import { getDefaultIntegrations, setAsyncLocalStorageAsyncContextStrategy } from '@sentry/cloudflare';
import { wrapRequestHandler } from '@sentry/cloudflare/request';
import { consoleSandbox } from '@sentry/core';
import type { NitroApp, NitroAppPlugin, ServerRequest } from 'nitro/types';
import { DEBUG_BUILD } from '../../common/debug-build';
import { captureErrorHook } from '../hooks/captureErrorHook';

type NitroAppWithHooks = NitroApp & { hooks: NonNullable<NitroApp['hooks']> };

let warnedAboutMissingExecutionContext = false;

/**
 * Sentry plugin for Nitro apps running on Cloudflare Workers.
 *
 * Default-export it from a file in your server `plugins/` directory, which Nitro registers
 * automatically (`serverDir` has to be set for the directory to be scanned). It is the only
 * registration a Workers build needs: it gives each request its own isolation scope, flushes
 * through `waitUntil`, and reports unhandled errors from Nitro's `error` hook.
 *
 * Passing a function defers the options to each request, which is what reading a DSN from a
 * request-scoped environment binding requires.
 *
 * @example Basic usage
 * ```ts
 * // server/plugins/sentry.ts
 * import { definePlugin } from 'nitro';
 * import { sentryCloudflareNitroPlugin } from '@sentry/nitro/cloudflare';
 *
 * export default definePlugin(
 *   sentryCloudflareNitroPlugin({
 *     dsn: '__YOUR_DSN__',
 *     tracesSampleRate: 1.0,
 *   }),
 * );
 * ```
 *
 * @example Reading the DSN from the runtime config
 * ```ts
 * // server/plugins/sentry.ts
 * import { definePlugin } from 'nitro';
 * import { useRuntimeConfig } from 'nitro/runtime-config';
 * import { sentryCloudflareNitroPlugin } from '@sentry/nitro/cloudflare';
 *
 * export default definePlugin(
 *   sentryCloudflareNitroPlugin(() => ({ dsn: useRuntimeConfig().sentryDsn })),
 * );
 * ```
 *
 * The runtime config only picks up keys declared in your Nitro config, so pair the second
 * example with `runtimeConfig: { sentryDsn: '' }` and set `NITRO_SENTRY_DSN` on the Worker.
 */
export const sentryCloudflareNitroPlugin =
  (optionsOrFn: CloudflareOptions | ((nitroApp: NitroApp) => CloudflareOptions)): NitroAppPlugin =>
  (nitroApp: NitroAppWithHooks): void => {
    const innerFetch = nitroApp.fetch.bind(nitroApp);

    nitroApp.fetch = (request: Request): Response | Promise<Response> => {
      const context = (request as ServerRequest).runtime?.cloudflare?.context;

      if (!context) {
        // `debug.log` stays silent until `init` enables it, and `init` is never reached on
        // this path, so a swallowed message would make the no-op SDK undiagnosable.
        if (DEBUG_BUILD && !warnedAboutMissingExecutionContext) {
          warnedAboutMissingExecutionContext = true;
          consoleSandbox(() =>
            // eslint-disable-next-line no-console
            console.warn(
              '[Sentry] No Cloudflare execution context found on the request. Requests will not be instrumented. This is expected in `nitro dev` and on non-Cloudflare presets.',
            ),
          );
        }
        return innerFetch(request);
      }

      // Only for instrumented requests, so a Node `--import` setup that registers this plugin
      // by accident keeps its OTel-aware async context strategy.
      setAsyncLocalStorageAsyncContextStrategy();

      const userOptions = typeof optionsOrFn === 'function' ? optionsOrFn(nitroApp) : optionsOrFn;

      const options: CloudflareOptions = {
        // Opts into the full integration set, which requires the Worker to enable `nodejs_compat`.
        defaultIntegrations: getDefaultIntegrations(userOptions),
        ...userOptions,
      };

      return wrapRequestHandler({ options, request, context }, () => innerFetch(request));
    };

    nitroApp.hooks.hook('error', captureErrorHook);
  };
