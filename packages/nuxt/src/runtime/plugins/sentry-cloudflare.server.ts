import type { ExecutionContext } from '@cloudflare/workers-types';
import type { CloudflareOptions } from '@sentry/cloudflare';
import {
  getActiveSpan,
  getTraceData,
  setAsyncLocalStorageAsyncContextStrategy,
  spanToJSON,
  wrapRequestHandler,
} from '@sentry/cloudflare';
import { continueTrace, getCurrentScope, getDefaultIsolationScope, getIsolationScope, logger } from '@sentry/core';
import type { H3Event } from 'h3';
import type { NitroApp, NitroAppPlugin } from 'nitropack';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';
import { addSentryTracingMetaTags } from '../utils';

interface CfEventType {
  protocol: string;
  host: string;
  context: {
    cloudflare: {
      context: ExecutionContext;
    };
  };
}

function isEventType(event: unknown): event is CfEventType {
  return (
    event !== null &&
    typeof event === 'object' &&
    'protocol' in event &&
    'host' in event &&
    'context' in event &&
    typeof event.protocol === 'string' &&
    typeof event.host === 'string' &&
    typeof event.context === 'object' &&
    event?.context !== null &&
    'cloudflare' in event.context &&
    typeof event.context.cloudflare === 'object' &&
    event?.context.cloudflare !== null &&
    'context' in event?.context?.cloudflare
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
    nitroApp.localFetch = new Proxy(nitroApp.localFetch, {
      async apply(handlerTarget, handlerThisArg, handlerArgs: [string, unknown]) {
        setAsyncLocalStorageAsyncContextStrategy();

        const sentryOptions = typeof optionsOrFn === 'function' ? optionsOrFn(nitroApp) : optionsOrFn;

        const pathname = handlerArgs[0];
        const event = handlerArgs[1];

        if (isEventType(event)) {
          const requestHandlerOptions = {
            options: sentryOptions,
            request: { ...event, url: `${event.protocol}//${event.host}${pathname}` },
            context: event.context.cloudflare.context,
          };

          // fixme same as 5
          console.log('::traceData 1', getTraceData());
          console.log('::propagationContext 1', JSON.stringify(getCurrentScope().getPropagationContext()));

          const traceData = getTraceData();

          // return continueTrace({ sentryTrace: traceData['sentry-trace'] || '', baggage: traceData.baggage }, () => {
          return wrapRequestHandler(requestHandlerOptions, () => {
            const isolationScope = getIsolationScope();
            const newIsolationScope =
              isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;

            logger.log(
              `Patched Cloudflare handler (\`nitroApp.localFetch\`). ${
                isolationScope === newIsolationScope ? 'Using existing' : 'Created new'
              } isolation scope.`,
            );

            console.log('::traceData 4', getTraceData());
            console.log('::propagationContext 4', JSON.stringify(getCurrentScope().getPropagationContext()));

            return handlerTarget.apply(handlerThisArg, handlerArgs);
          });
          // });
        }

        return handlerTarget.apply(handlerThisArg, handlerArgs);
      },
    });

    // todo: start span in a hook before the request handler

    // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
    nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext, { event }: { event: H3Event }) => {
      // fixme: it's attaching the html meta tag but it's not connecting the trace
      // fixme: its' actually connecting the trace but the meta tags are cached
      console.log('event.headers', event.headers);
      console.log('event.node.req.headers.cache-control', event.node.req.headers['cache-control']);
      console.log('event.context', event.context);

      const span = getActiveSpan();

      console.log('::active span', span ? spanToJSON(span) : 'no active span');

      console.log('::traceData 5', getTraceData());
      console.log('::propagationContext 5', JSON.stringify(getCurrentScope().getPropagationContext()));

      addSentryTracingMetaTags(html.head);
    });

    nitroApp.hooks.hook('error', sentryCaptureErrorHook);
  };
