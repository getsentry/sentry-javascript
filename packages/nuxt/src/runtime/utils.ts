import type { ClientOptions, Context } from '@sentry/core';
import { flush, GLOBAL_OBJ, logger, vercelWaitUntil } from '@sentry/core';
import { captureException, dropUndefinedKeys, getClient, getTraceMetaTags } from '@sentry/core';
import type { VueOptions } from '@sentry/vue/src/types';
import type { CapturedErrorContext } from 'nitropack';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import type { ComponentPublicInstance } from 'vue';
import * as SentryNode from '@sentry/node';

/**
 *  Extracts the relevant context information from the error context (H3Event in Nitro Error)
 *  and created a structured context object.
 */
export function extractErrorContext(errorContext: CapturedErrorContext): Context {
  const structuredContext: Context = {
    method: undefined,
    path: undefined,
    tags: undefined,
  };

  if (errorContext) {
    if (errorContext.event) {
      structuredContext.method = errorContext.event._method || undefined;
      structuredContext.path = errorContext.event._path || undefined;
    }

    if (Array.isArray(errorContext.tags)) {
      structuredContext.tags = errorContext.tags || undefined;
    }
  }

  return dropUndefinedKeys(structuredContext);
}

/**
 * Adds Sentry tracing <meta> tags to the returned html page.
 *
 * Exported only for testing
 */
export function addSentryTracingMetaTags(head: NuxtRenderHTMLContext['head']): void {
  const metaTags = getTraceMetaTags();

  if (metaTags) {
    head.push(metaTags);
  }
}

/**
 *  Reports an error to Sentry. This function is similar to `attachErrorHandler` in `@sentry/vue`.
 *  The Nuxt SDK does not register an error handler, but uses the Nuxt error hooks to report errors.
 *
 *  We don't want to use the error handling from `@sentry/vue` as it wraps the existing error handler, which leads to a 500 error: https://github.com/getsentry/sentry-javascript/issues/12515
 */
export function reportNuxtError(options: {
  error: unknown;
  instance?: ComponentPublicInstance | null;
  info?: string;
}): void {
  const { error, instance, info } = options;

  const metadata: Record<string, unknown> = {
    info,
    // todo: add component name and trace (like in the vue integration)
  };

  if (instance?.$props) {
    const sentryClient = getClient();
    const sentryOptions = sentryClient ? (sentryClient.getOptions() as ClientOptions & VueOptions) : null;

    // `attachProps` is enabled by default and props should only not be attached if explicitly disabled (see DEFAULT_CONFIG in `vueIntegration`).
    if (sentryOptions?.attachProps && instance.$props !== false) {
      metadata.propsData = instance.$props;
    }
  }

  // Capture exception in the next event loop, to make sure that all breadcrumbs are recorded in time.
  setTimeout(() => {
    captureException(error, {
      captureContext: { contexts: { nuxt: metadata } },
      mechanism: { handled: false },
    });
  });
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

/**
 *  Flushes if in a serverless environment
 */
export async function flushIfServerless(): Promise<void> {
  const isServerless =
    !!process.env.FUNCTIONS_WORKER_RUNTIME || // Azure Functions
    !!process.env.LAMBDA_TASK_ROOT || // AWS Lambda
    !!process.env.CF_PAGES || // Cloudflare
    !!process.env.VERCEL ||
    !!process.env.NETLIFY;

  // @ts-expect-error This is not typed
  if (GLOBAL_OBJ[Symbol.for('@vercel/request-context')]) {
    vercelWaitUntil(flushWithTimeout());
  } else if (isServerless) {
    await flushWithTimeout();
  }
}
