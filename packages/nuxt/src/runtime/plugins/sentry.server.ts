import { captureException } from '@sentry/node';
import { H3Error } from 'h3';
import { defineNitroPlugin } from 'nitropack/runtime';
import { extractErrorContext } from '../utils';

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('error', (error, errorContext) => {
    // Do not handle 404 and 422
    if (error instanceof H3Error) {
      // Do not report if status code is 3xx or 4xx
      if (error.statusCode >= 300 && error.statusCode < 500) {
        return;
      }
    }

    const structuredContext = extractErrorContext(errorContext);

    captureException(error, {
      captureContext: { contexts: { nuxt: structuredContext } },
      mechanism: { handled: false },
    });
  });
});
