import * as Sentry from '@sentry/node';
import { H3Error } from 'h3';
import { defineNitroPlugin } from 'nitropack/runtime';
import type { NuxtRenderHTMLContext } from 'nuxt/app';
import { addSentryTracingMetaTags, extractErrorContext, vercelWaitUntilAndFlush } from '../utils';

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('error', (error, errorContext) => {
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

    vercelWaitUntilAndFlush();
  });

  // @ts-expect-error - 'render:html' is a valid hook name in the Nuxt context
  nitroApp.hooks.hook('render:html', (html: NuxtRenderHTMLContext) => {
    addSentryTracingMetaTags(html.head);
  });

  nitroApp.hooks.hook('afterResponse', () => {
    vercelWaitUntilAndFlush();
  });
});
