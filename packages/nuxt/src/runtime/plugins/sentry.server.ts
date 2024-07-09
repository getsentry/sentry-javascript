import { captureException } from '@sentry/node';
import { H3Error } from 'h3';
import { defineNitroPlugin } from 'nitropack/runtime';
import { extractErrorContext } from '../utils';

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('error', (error, errorContext) => {
    // Do not handle 404 and 422
    if (error instanceof H3Error) {
      if (error.statusCode === 404 || error.statusCode === 422) {
        return;
      }
    }

    if (errorContext) {
      const structuredContext = extractErrorContext(errorContext);

      captureException(error, {
        captureContext: { contexts: { nuxt: structuredContext } },
        mechanism: { handled: false },
      });
    } else {
      captureException(error, { mechanism: { handled: false } });
    }
  });
});
