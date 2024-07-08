import { captureException } from '@sentry/node';
import { H3Error } from 'h3';
import { defineNitroPlugin } from 'nitropack/runtime';

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('error', (error, context) => {
    // Do not handle 404 and 422
    if (error instanceof H3Error) {
      if (error.statusCode === 404 || error.statusCode === 422) {
        return;
      }
    }

    if (context) {
      captureException(error, {
        captureContext: { extra: { nuxt: context } },
        mechanism: { handled: false },
      });
    } else {
      captureException(error, { mechanism: { handled: false } });
    }
  });
});
