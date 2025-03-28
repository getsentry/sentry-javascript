import { Context, GLOBAL_OBJ, flush, logger, vercelWaitUntil } from '@sentry/core';
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

async function flushIfServerless(): Promise<void> {
  const isServerless =
    !!process.env.FUNCTIONS_WORKER_RUNTIME || // Azure Functions
    !!process.env.LAMBDA_TASK_ROOT || // AWS Lambda
    !!process.env.VERCEL ||
    !!process.env.NETLIFY;

  // @ts-expect-error This is not typed
  if (GLOBAL_OBJ[Symbol.for('@vercel/request-context')]) {
    vercelWaitUntil(flushWithTimeout());
  } else if (isServerless) {
    await flushWithTimeout();
  }
}

async function flushWithTimeout(): Promise<void> {
  const sentryClient = SentryNode.getClient();
  const isDebug = sentryClient ? sentryClient.getOptions().debug : false;

  try {
    isDebug && logger.log('Flushing events...');
    await flush(2000);
    isDebug && logger.log('Done flushing events');
  } catch (e) {
    isDebug && logger.log('Error while flushing events:\n', e);
  }
}
