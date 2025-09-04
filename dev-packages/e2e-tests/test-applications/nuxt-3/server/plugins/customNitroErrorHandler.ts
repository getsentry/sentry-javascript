import { Context, flushIfServerless } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import { H3Error } from 'h3';
import type { CapturedErrorContext } from 'nitropack';
import { defineNitroPlugin } from '#imports';

// Copy from SDK-internal error handler (nuxt/src/runtime/plugins/sentry.server.ts)
export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('error', async (error, errorContext) => {
    // Do not handle 404 and 422
    if (error instanceof H3Error) {
      // Do not report if status code is 3xx or 4xx
      if (error.statusCode >= 300 && error.statusCode < 500) {
        return;
      }
    }

    const { method, path } = {
      method: errorContext.event?._method ? errorContext.event._method : '',
      path: errorContext.event?._path ? errorContext.event._path : null,
    };

    if (path) {
      SentryNode.getCurrentScope().setTransactionName(`${method} ${path}`);
    }

    const structuredContext = extractErrorContext(errorContext);

    SentryNode.captureException(error, {
      captureContext: { contexts: { nuxt: structuredContext } },
      mechanism: { handled: false },
    });

    await flushIfServerless();
  });
});

function extractErrorContext(errorContext: CapturedErrorContext): Context {
  const ctx: Context = {};

  if (!errorContext) {
    return ctx;
  }

  if (errorContext.event) {
    ctx.method = errorContext.event._method;
    ctx.path = errorContext.event._path;
  }

  if (Array.isArray(errorContext.tags)) {
    ctx.tags = errorContext.tags;
  }

  return ctx;
}
