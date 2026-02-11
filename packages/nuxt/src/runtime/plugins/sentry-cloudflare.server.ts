import type { CloudflareOptions } from '@sentry/cloudflare';
import { setAsyncLocalStorageAsyncContextStrategy, wrapRequestHandler } from '@sentry/cloudflare';
import { debug, getDefaultIsolationScope, getIsolationScope, getTraceData } from '@sentry/core';
import type { H3Event } from 'h3';
import type { NitroApp, NitroAppPlugin } from 'nitropack';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';
import { updateRouteBeforeResponse } from '../hooks/updateRouteBeforeResponse';
import { addSentryTracingMetaTags } from '../utils';
import { getCfProperties, getCloudflareProperties, hasCfProperty, isEventType } from '../utils/event-type-check';

/**
 * Sentry Cloudflare Nitro plugin for when using the "cloudflare-pages" preset in Nuxt.
 * This plugin automatically sets up Sentry error monitoring and performance tracking for Cloudflare Pages projects.
 *
 * Instead of adding a `sentry.server.config.ts` file, export this plugin in the `server/plugins` directory
 * with the necessary Sentry options to enable Sentry for your Cloudflare Pages project.
 *
 *
 * @example Basic usage
 * ```ts
 * // nitro/plugins/sentry.ts
 * import { defineNitroPlugin } from '#imports'
 * import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins'
 *
 * export default defineNitroPlugin(sentryCloudflareNitroPlugin({
 *   dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
 *   tracesSampleRate: 1.0,
 * }));
 * ```
 *
 * @example Dynamic configuration with nitroApp
 * ```ts
 * // nitro/plugins/sentry.ts
 * import { defineNitroPlugin } from '#imports'
 * import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins'
 *
 * export default defineNitroPlugin(sentryCloudflareNitroPlugin(nitroApp => ({
 *   dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
 *   debug: nitroApp.h3App.options.debug
 * })));
 * ```
 */
export const sentryCloudflareNitroPlugin =
  (optionsOrFn: CloudflareOptions | ((nitroApp: NitroApp) => CloudflareOptions)): NitroAppPlugin =>
  (nitroApp: NitroApp): void => {
    const traceDataMap = new WeakMap<object, ReturnType<typeof getTraceData>>();

    nitroApp.localFetch = new Proxy(nitroApp.localFetch, {
      async apply(handlerTarget, handlerThisArg, handlerArgs: [string, unknown]) {
        setAsyncLocalStorageAsyncContextStrategy();

        const cloudflareOptions = typeof optionsOrFn === 'function' ? optionsOrFn(nitroApp) : optionsOrFn;
        const pathname = handlerArgs[0];
        const event = handlerArgs[1];

        if (!isEventType(event)) {
          debug.log("Nitro Cloudflare plugin did not detect a Cloudflare event type. Won't patch Cloudflare handler.");
          return handlerTarget.apply(handlerThisArg, handlerArgs);
        } else {
          // Usually, the protocol already includes ":"
          const url = `${event.protocol}${event.protocol.endsWith(':') ? '' : ':'}//${event.host}${pathname}`;
          const request = new Request(url, {
            method: event.method,
            headers: event.headers,
            // @ts-expect-error - 'cf' is a valid property in the RequestInit type for Cloudflare
            cf: getCfProperties(event),
          });

          const requestHandlerOptions = {
            options: cloudflareOptions,
            request,
            context: getCloudflareProperties(event).context,
          };

          return wrapRequestHandler(requestHandlerOptions, () => {
            const isolationScope = getIsolationScope();
            const newIsolationScope =
              isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;

            const traceData = getTraceData();
            if (traceData && Object.keys(traceData).length > 0) {
              // Storing trace data in the WeakMap using event.context.cf as key for later use in HTML meta-tags
              traceDataMap.set(getCfProperties(event), traceData);
              debug.log('Stored trace data for later use in HTML meta-tags: ', traceData);
            }

            debug.log(
              `Patched Cloudflare handler (\`nitroApp.localFetch\`). ${
                isolationScope === newIsolationScope ? 'Using existing' : 'Created new'
              } isolation scope.`,
            );

            return handlerTarget.apply(handlerThisArg, handlerArgs);
          });
        }
      },
    });

    nitroApp.hooks.hook('beforeResponse', updateRouteBeforeResponse);

    // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
    nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext, { event }: { event: H3Event }) => {
      let storedTraceData: ReturnType<typeof getTraceData> | undefined = undefined;

      if (
        event?.context &&
        '_platform' in event.context &&
        event.context._platform &&
        hasCfProperty(event.context._platform)
      ) {
        storedTraceData = traceDataMap.get(event.context._platform.cf);
      } else if (event?.context && hasCfProperty(event.context)) {
        // legacy support (before Nitro v2.11.7 (PR: https://github.com/nitrojs/nitro/pull/3224))
        storedTraceData = traceDataMap.get(event.context.cf);
      }

      if (storedTraceData && Object.keys(storedTraceData).length > 0) {
        debug.log('Using stored trace data for HTML meta-tags: ', storedTraceData);
        addSentryTracingMetaTags(html.head, storedTraceData);
      } else {
        addSentryTracingMetaTags(html.head);
      }
    });

    nitroApp.hooks.hook('error', sentryCaptureErrorHook);
  };
