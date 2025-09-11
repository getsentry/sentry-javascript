import type { ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import type { CloudflareOptions } from '@sentry/cloudflare';
import { setAsyncLocalStorageAsyncContextStrategy, wrapRequestHandler } from '@sentry/cloudflare';
import { debug, getDefaultIsolationScope, getIsolationScope, getTraceData } from '@sentry/core';
import type { H3Event } from 'h3';
import type { NitroApp, NitroAppPlugin } from 'nitropack';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';
import { updateRouteBeforeResponse } from '../hooks/updateRouteBeforeResponse';
import { addSentryTracingMetaTags } from '../utils';

interface EventBase {
  protocol: string;
  host: string;
  method: string;
  headers: Record<string, string>;
}

interface MinimalCfProps {
  httpProtocol?: string;
  country?: string;
  // ...other CF properties
}

interface MinimalCloudflareProps {
  context: ExecutionContext;
  request?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

// Direct shape: cf and cloudflare are directly on context
interface CfEventDirect extends EventBase {
  context: {
    cf: MinimalCfProps;
    cloudflare: MinimalCloudflareProps;
  };
}

// Nested shape: cf and cloudflare are under _platform
// Since Nitro v2.12.0 (PR: https://github.com/nitrojs/nitro/commit/911a63bc478183acb472d05e977584dcdce61abf)
interface CfEventPlatform extends EventBase {
  context: {
    _platform: {
      cf: MinimalCfProps;
      cloudflare: MinimalCloudflareProps;
    };
  };
}

type CfEventType = CfEventDirect | CfEventPlatform;

function isEventType(event: unknown): event is CfEventType {
  if (event === null || typeof event !== 'object') return false;

  return (
    // basic properties
    'protocol' in event &&
    'host' in event &&
    typeof event.protocol === 'string' &&
    typeof event.host === 'string' &&
    // context property
    'context' in event &&
    typeof event.context === 'object' &&
    event.context !== null &&
    // context.cf properties
    'cf' in event.context &&
    typeof event.context.cf === 'object' &&
    event.context.cf !== null &&
    // context.cloudflare properties
    'cloudflare' in event.context &&
    typeof event.context.cloudflare === 'object' &&
    event.context.cloudflare !== null &&
    'context' in event.context.cloudflare
  );
}

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
            cf: event.context.cf,
          }) as Request<unknown, IncomingRequestCfProperties<unknown>>;

          const requestHandlerOptions = {
            options: cloudflareOptions,
            request,
            context: event.context.cloudflare.context,
          };

          return wrapRequestHandler(requestHandlerOptions, () => {
            const isolationScope = getIsolationScope();
            const newIsolationScope =
              isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;

            const traceData = getTraceData();
            if (traceData && Object.keys(traceData).length > 0) {
              // Storing trace data in the WeakMap using event.context.cf as key for later use in HTML meta-tags
              traceDataMap.set(event.context.cf, traceData);
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
      const storedTraceData = event?.context?.cf ? traceDataMap.get(event.context.cf) : undefined;

      if (storedTraceData && Object.keys(storedTraceData).length > 0) {
        debug.log('Using stored trace data for HTML meta-tags: ', storedTraceData);
        addSentryTracingMetaTags(html.head, storedTraceData);
      } else {
        addSentryTracingMetaTags(html.head);
      }
    });

    nitroApp.hooks.hook('error', sentryCaptureErrorHook);
  };
