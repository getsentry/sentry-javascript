import type { ExecutionContext } from '@cloudflare/workers-types';
import type { CloudflareOptions } from '@sentry/cloudflare';
import { setAsyncLocalStorageAsyncContextStrategy, wrapRequestHandler } from '@sentry/cloudflare';
import { getDefaultIsolationScope, getIsolationScope, logger } from '@sentry/core';
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

          const isolationScope = getIsolationScope();
          const newIsolationScope =
            isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;

          logger.log(
            `Patched Cloudflare handler (\`nitroApp.localFetch\`). ${
              isolationScope === newIsolationScope ? 'Using existing' : 'Created new'
            } isolation scope.`,
          );

          return wrapRequestHandler(requestHandlerOptions, () => handlerTarget.apply(handlerThisArg, handlerArgs));
        }

        return handlerTarget.apply(handlerThisArg, handlerArgs);
      },
    });

    // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
    nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext) => {
      // fixme: it's attaching the html meta tag but it's not connecting the trace
      // fixme: its' actually connecting the trace but the meta tags are cached
      addSentryTracingMetaTags(html.head);
    });

    nitroApp.hooks.hook('error', sentryCaptureErrorHook);
  };
