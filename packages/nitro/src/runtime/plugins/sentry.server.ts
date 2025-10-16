import {
  debug,
  flushIfServerless,
  getDefaultIsolationScope,
  getIsolationScope,
  withIsolationScope,
} from '@sentry/core';
import type { EventHandler } from 'h3';
import { defineNitroPlugin } from 'nitropack/runtime';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';
import { updateRouteBeforeResponse } from '../hooks/updateRouteBeforeResponse';
import { addSentryTracingMetaTags } from '../utils/common';

export default defineNitroPlugin(nitro => {
  nitro.h3App.handler = patchEventHandler(nitro.h3App.handler);

  nitro.hooks.hook('beforeResponse', updateRouteBeforeResponse);
  nitro.hooks.hook('error', sentryCaptureErrorHook);

  // @ts-expect-error - Nitro hook type is not yet defined
  nitro.hooks.hook('render:html', html => {
    console.log('html', html);
    return html;
  });

  nitro.hooks.hook('render:response', (response, { event }) => {
    console.log('response', response);
    const headers = event.node.res?.getHeaders() || {};
    const isPreRenderedPage = Object.keys(headers).includes('x-nitro-prerender');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const isSWRCachedPage = event?.context?.cache?.options.swr as boolean | undefined;

    const contentType = String(headers['content-type']);
    const isPageloadRequest = contentType.startsWith('text/html');
    console.log('isPageloadRequest', isPageloadRequest);
    console.log('isPreRenderedPage', isPreRenderedPage);
    console.log('isSWRCachedPage', isSWRCachedPage);
    console.log('response', response.body);
    if (!isPageloadRequest) {
      return;
    }

    if (!isPreRenderedPage && !isSWRCachedPage) {
      addSentryTracingMetaTags(response);
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
