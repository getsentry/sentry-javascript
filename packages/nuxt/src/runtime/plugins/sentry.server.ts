import {
  GLOBAL_OBJ,
  consoleSandbox,
  flush,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  logger,
  vercelWaitUntil,
  withIsolationScope,
} from '@sentry/core';
import * as Sentry from '@sentry/node';
import { H3Error } from 'h3';
import { defineNitroPlugin } from 'nitropack/runtime';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { addSentryTracingMetaTags, extractErrorContext } from '../utils';

export default defineNitroPlugin(nitroApp => {
  nitroApp.h3App.handler = new Proxy(nitroApp.h3App.handler, {
    async apply(handlerTarget, handlerThisArg, handlerArgs: Parameters<typeof nitroApp.h3App.handler>) {
      // In environments where we cannot make use of OTel httpInstrumentation, e.g. when using top level import
      // of the server instrumentation file instead of `--import` or dynamic import like on vercel
      // we still need to ensure requests are properly isolated
      const isolationScope = getIsolationScope();
      const newIsolationScope = isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;

      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.log(
          `[Sentry] Patched event handler. Using ${
            isolationScope === newIsolationScope ? 'existing' : 'new'
          } isolationscope.`,
        );
      });

      return withIsolationScope(newIsolationScope, async () => {
        try {
          return await handlerTarget.apply(handlerThisArg, handlerArgs);
        } finally {
          await flushIfServerless();
        }
      });
    },
  });

  nitroApp.hooks.hook('error', async (error, errorContext) => {
    // Do not handle 404 and 422
    if (error instanceof H3Error) {
      // Do not report if status code is 3xx or 4xx
      if (error.statusCode >= 300 && error.statusCode < 500) {
        return;
      }
    }

    const { method, path } = {
      method: errorContext.event && errorContext.event._method ? errorContext.event._method : '',
      path: errorContext.event && errorContext.event._path ? errorContext.event._path : null,
    };

    if (path) {
      Sentry.getCurrentScope().setTransactionName(`${method} ${path}`);
    }

    const structuredContext = extractErrorContext(errorContext);

    Sentry.captureException(error, {
      captureContext: { contexts: { nuxt: structuredContext } },
      mechanism: { handled: false },
    });

    await flushIfServerless();
  });

  // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
  nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext) => {
    addSentryTracingMetaTags(html.head);
  });
});

async function flushIfServerless(): Promise<void> {
  const isServerless = !!process.env.LAMBDA_TASK_ROOT || !!process.env.VERCEL || !!process.env.NETLIFY;

  // @ts-expect-error This is not typed
  if (GLOBAL_OBJ[Symbol.for('@vercel/request-context')]) {
    vercelWaitUntil(flushWithTimeout());
  } else if (isServerless) {
    await flushWithTimeout();
  }
}

async function flushWithTimeout(): Promise<void> {
  const sentryClient = getClient();
  const isDebug = sentryClient ? sentryClient.getOptions().debug : false;

  try {
    isDebug && logger.log('Flushing events...');
    await flush(2000);
    isDebug && logger.log('Done flushing events');
  } catch (e) {
    isDebug && logger.log('Error while flushing events:\n', e);
  }
}
