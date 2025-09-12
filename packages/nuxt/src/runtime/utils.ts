import type { ClientOptions, Context, SerializedTraceData } from '@sentry/core';
import { captureException, debug, getClient, getTraceMetaTags } from '@sentry/core';
import type { VueOptions } from '@sentry/vue/src/types';
import type { CapturedErrorContext } from 'nitropack/types';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import type { ComponentPublicInstance } from 'vue';

/**
 *  Extracts the relevant context information from the error context (H3Event in Nitro Error)
 *  and created a structured context object.
 */
export function extractErrorContext(errorContext: CapturedErrorContext | undefined): Context {
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

/**
 * Adds Sentry tracing <meta> tags to the returned html page.
 *
 * Exported only for testing
 */
export function addSentryTracingMetaTags(head: NuxtRenderHTMLContext['head'], traceData?: SerializedTraceData): void {
  const metaTags = getTraceMetaTags(traceData);

  if (head.some(tag => tag.includes('meta') && tag.includes('sentry-trace'))) {
    debug.warn(
      'Skipping addition of meta tags. Sentry tracing meta tags are already present in HTML page. Make sure to only set up Sentry once on the server-side. ',
    );
    return;
  }

  if (metaTags) {
    debug.log('Adding Sentry tracing meta tags to HTML page:', metaTags);
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
      mechanism: { handled: false, type: `auto.function.nuxt.${instance ? 'vue' : 'app'}-error` },
    });
  });
}
