import {
  debug,
  flushIfServerless,
  getDefaultIsolationScope,
  getIsolationScope,
  withIsolationScope,
} from '@sentry/core';
import type { EventHandler, H3Event } from 'h3';
import { defineNitroPlugin } from 'nitropack/runtime';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';
import { updateRouteBeforeResponse } from '../hooks/updateRouteBeforeResponse';
import { addSentryTracingMetaTags } from '../utils';

export default defineNitroPlugin(nitroApp => {
  nitroApp.h3App.handler = patchEventHandler(nitroApp.h3App.handler);

  nitroApp.hooks.hook('beforeResponse', updateRouteBeforeResponse);

  nitroApp.hooks.hook('error', sentryCaptureErrorHook);

  // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
  nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext, { event }: { event: H3Event }) => {
    const headers = event.node.res?.getHeaders() || {};

    const isPreRenderedPage = Object.keys(headers).includes('x-nitro-prerender');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const isSWRCachedPage = event?.context?.cache?.options.swr as boolean | undefined;

    if (!isPreRenderedPage && !isSWRCachedPage) {
      addSentryTracingMetaTags(html.head);
    } else {
      const reason = isPreRenderedPage ? 'the page was pre-rendered' : 'SWR caching is enabled for the route';
      debug.log(
        `Not adding Sentry tracing meta tags to HTML for ${event.path} because ${reason}. This will disable distributed tracing and prevent connecting multiple client page loads to the same server request.`,
      );
    }
  });
});

function patchEventHandler(handler: EventHandler): EventHandler {
  return new Proxy(handler, {
    async apply(handlerTarget, handlerThisArg, handlerArgs: Parameters<EventHandler>) {
      const isolationScope = getIsolationScope();
      const newIsolationScope = isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;

      debug.log(
        `Patched h3 event handler. ${
          isolationScope === newIsolationScope ? 'Using existing' : 'Created new'
        } isolation scope.`,
      );

      return withIsolationScope(newIsolationScope, async () => {
        try {
          return await handlerTarget.apply(handlerThisArg, handlerArgs);
        } finally {
          await flushIfServerless();
        }
      });
    },
  });
}
