import { captureException, flush, getClient, getTraceMetaTags } from '@sentry/core';
import type { ClientOptions, Context } from '@sentry/types';
import { dropUndefinedKeys, logger, vercelWaitUntil } from '@sentry/utils';
import type { VueOptions } from '@sentry/vue/src/types';
import type { CapturedErrorContext } from 'nitropack';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import type { ComponentPublicInstance } from 'vue';

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

  if (instance && instance.$props) {
    const sentryClient = getClient();
    const sentryOptions = sentryClient ? (sentryClient.getOptions() as ClientOptions & VueOptions) : null;

    // `attachProps` is enabled by default and props should only not be attached if explicitly disabled (see DEFAULT_CONFIG in `vueIntegration`).
    if (sentryOptions && sentryOptions.attachProps && instance.$props !== false) {
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

/**
 * Flushes pending Sentry events with a 2 seconds timeout and in a way that cannot create unhandled promise rejections.
 *
 */
export async function flushSafelyWithTimeout(isDebug: boolean): Promise<void> {
  try {
    isDebug && logger.log('Flushing events...');
    await flush(2000);
    isDebug && logger.log('Done flushing events');
  } catch (e) {
    isDebug && logger.log('Error while flushing events:\n', e);
  }
}

/**
 *  Utility function for the Nuxt module runtime function as we always have to get the client instance to get
 *  the `debug` option (we cannot access BUILD_DEBUG in the module runtime).
 *
 *  This function should be called when Nitro ends a request (so Vercel can wait).
 */
export function vercelWaitUntilAndFlush(): void {
  const sentryClient = getClient();

  if (sentryClient) {
    vercelWaitUntil(flushSafelyWithTimeout(sentryClient.getOptions().debug || false));
  }
}
