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
import { injectTracingMetaTags } from '../hooks/injectTracingMetaTags';
import { updateRouteBeforeResponse } from '../hooks/updateRouteBeforeResponse';

export default defineNitroPlugin(nitro => {
  nitro.h3App.handler = patchEventHandler(nitro.h3App.handler);

  nitro.hooks.hook('beforeResponse', updateRouteBeforeResponse);
  nitro.hooks.hook('error', sentryCaptureErrorHook);

  // nitro.hooks.hook('render:response', (response, { event }) => {
  //   console.log('response', response);
  //   console.log('event', event);
  //   return response;
  // });

  nitro.hooks.hook('beforeResponse', injectTracingMetaTags);
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
