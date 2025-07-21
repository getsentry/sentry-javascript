import { debug, getDefaultIsolationScope, getIsolationScope, withIsolationScope } from '@sentry/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import { type EventHandler } from 'h3';
// eslint-disable-next-line import/no-extraneous-dependencies
import { defineNitroPlugin } from 'nitropack/runtime';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { sentryCaptureErrorHook } from '../hooks/captureErrorHook';
import { updateRouteBeforeResponse } from '../hooks/updateRouteBeforeResponse';
import { addSentryTracingMetaTags, flushIfServerless } from '../utils';

export default defineNitroPlugin(nitroApp => {
  nitroApp.h3App.handler = patchEventHandler(nitroApp.h3App.handler);

  nitroApp.hooks.hook('beforeResponse', updateRouteBeforeResponse);

  nitroApp.hooks.hook('error', sentryCaptureErrorHook);

  // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
  nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext) => {
    addSentryTracingMetaTags(html.head);
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
