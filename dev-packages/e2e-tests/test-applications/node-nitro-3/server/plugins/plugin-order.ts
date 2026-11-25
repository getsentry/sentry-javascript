import * as Sentry from '@sentry/node';
import { definePlugin } from 'nitro';
import type { H3Event } from 'nitro/h3';

// Read at startup: the Sentry Nitro plugin imports `sentry.server.config.ts` before the app's own plugins run.
const initializedBeforePlugins = Sentry.isInitialized();

export default definePlugin(nitroApp => {
  nitroApp.hooks.hook('request', event => {
    (event as H3Event).context.sentryInitializedBeforePlugins = initializedBeforePlugins;
  });
});
