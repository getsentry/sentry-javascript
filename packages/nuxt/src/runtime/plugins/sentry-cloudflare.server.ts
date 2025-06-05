import type { ExecutionContext } from '@cloudflare/workers-types';
import type { CloudflareOptions } from '@sentry/cloudflare';
import { setAsyncLocalStorageAsyncContextStrategy, wrapRequestHandler } from '@sentry/cloudflare';
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

export const cloudflareNitroPlugin =
  (sentryOptions: CloudflareOptions): NitroAppPlugin =>
  (nitroApp: NitroApp): void => {
    nitroApp.localFetch = new Proxy(nitroApp.localFetch, {
      async apply(handlerTarget, handlerThisArg, handlerArgs: [string, unknown]) {
        // fixme: is this the correct spot?
        setAsyncLocalStorageAsyncContextStrategy();

        const pathname = handlerArgs[0];
        const event = handlerArgs[1];

        if (isEventType(event)) {
          const requestHandlerOptions = {
            options: sentryOptions,
            request: { ...event, url: `${event.protocol}//${event.host}${pathname}` },
            context: event.context.cloudflare.context,
          };

          // todo: wrap in isolation scope (like regular handler)
          return wrapRequestHandler(requestHandlerOptions, () => handlerTarget.apply(handlerThisArg, handlerArgs));
        }

        return handlerTarget.apply(handlerThisArg, handlerArgs);
      },
    });

    // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
    nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext) => {
      // fixme: it's attaching the html meta tag but it's not connecting the trace
      addSentryTracingMetaTags(html.head);
    });

    nitroApp.hooks.hook('error', sentryCaptureErrorHook);
  };
