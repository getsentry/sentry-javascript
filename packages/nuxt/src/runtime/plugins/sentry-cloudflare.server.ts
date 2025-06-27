import type { ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import type { CloudflareOptions } from '@sentry/cloudflare';
import { setAsyncLocalStorageAsyncContextStrategy, wrapRequestHandler } from '@sentry/cloudflare';
import { getDefaultIsolationScope, getIsolationScope, getTraceData, logger } from '@sentry/core';
import type { H3Event } from 'h3';
import type { NitroApp, NitroAppPlugin } from 'nitropack';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';
import { addSentryTracingMetaTags } from '../utils';

interface CfEventType {
  protocol: string;
  host: string;
  method: string;
  headers: Record<string, string>;
  context: {
    cf: {
      httpProtocol?: string;
      country?: string;
      // ...other CF properties
    };
    cloudflare: {
      context: ExecutionContext;
      request?: Record<string, unknown>;
      env?: Record<string, unknown>;
    };
  };
}

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

const TRACE_DATA_KEY = '__sentryTraceData';

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
    nitroApp.localFetch = new Proxy(nitroApp.localFetch, {
      async apply(handlerTarget, handlerThisArg, handlerArgs: [string, unknown]) {
        setAsyncLocalStorageAsyncContextStrategy();

        const cloudflareOptions = typeof optionsOrFn === 'function' ? optionsOrFn(nitroApp) : optionsOrFn;
        const pathname = handlerArgs[0];
        const event = handlerArgs[1];

        if (!isEventType(event)) {
          logger.log("Nitro Cloudflare plugin did not detect a Cloudflare event type. Won't patch Cloudflare handler.");
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
              // Storing trace data in the event context for later use in HTML meta-tags (enables correct connection of parent/child span relationships)
              // @ts-expect-error Storing a new key in the event context
              event.context[TRACE_DATA_KEY] = traceData;
              logger.log('Stored trace data in the event context.');
            }

            logger.log(
              `Patched Cloudflare handler (\`nitroApp.localFetch\`). ${
                isolationScope === newIsolationScope ? 'Using existing' : 'Created new'
              } isolation scope.`,
            );

            return handlerTarget.apply(handlerThisArg, handlerArgs);
          });
        }
      },
    });

    // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
    nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext, { event }: { event: H3Event }) => {
      const storedTraceData = event.context[TRACE_DATA_KEY] as ReturnType<typeof getTraceData> | undefined;

      if (storedTraceData && Object.keys(storedTraceData).length > 0) {
        logger.log('Using stored trace data from event context for meta tags.');
        addSentryTracingMetaTags(html.head, storedTraceData);
      } else {
        addSentryTracingMetaTags(html.head);
      }
    });

    nitroApp.hooks.hook('error', sentryCaptureErrorHook);
  };
