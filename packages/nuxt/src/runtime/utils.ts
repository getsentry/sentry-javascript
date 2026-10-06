import type { ClientOptions, Context, SerializedTraceData } from '@sentry/core';
import { captureException, debug, getClient, getTraceMetaTags, isObjectLike } from '@sentry/core';
import type { CapturedErrorContext } from 'nitropack/types';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import type { ComponentPublicInstance } from 'vue';

/**
 * Reads the request method and path off the event Nitro passes to its `error` hook.
 *
 * h3 v1 (Nitro v2) exposes `method` and `path` getters. h3 v2 (Nitro v3) has neither: the method lives
 * on the web `Request` in `req`, and the path on the parsed `url`.
 */
export function getEventRequestInfo(event: unknown): { method?: string; path?: string } {
  if (!isObjectLike(event)) {
    return {};
  }

  const { method, path, req, url } = event as {
    method?: string;
    path?: string;
    req?: { method?: string };
    url?: { pathname?: string };
  };

  return { method: method ?? req?.method, path: path ?? url?.pathname };
}

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
    const { method, path } = getEventRequestInfo(errorContext.event);
    ctx.method = method;
    ctx.path = path;
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
    // `attachProps` is defined in the Vue integration options, but the type is not exported from @sentry/vue, as it's only used internally.
    const sentryOptions = sentryClient ? (sentryClient.getOptions() as ClientOptions & { attachProps: boolean }) : null;

    // `attachProps` is enabled by default and props should only not be attached if explicitly disabled (see DEFAULT_CONFIG in `vueIntegration`).
    // oxlint-disable-next-line typescript/no-unsafe-member-access
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
