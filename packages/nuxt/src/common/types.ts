import type { SentryNitroOptions } from '@sentry/nitro';
import type { init as initNode } from '@sentry/node';
import type { init as initVue } from '@sentry/vue';

// Omitting Vue 'app' as the Nuxt SDK will add the app instance in the client plugin (users do not have to provide this)
// Adding `& object` helps TS with inferring that this is not `undefined` but an object type
export type SentryNuxtClientOptions = Omit<Parameters<typeof initVue>[0] & object, 'app'>;
export type SentryNuxtServerOptions = Parameters<typeof initNode>[0] & {
  /**
   * Enables the Sentry error handler for the Nitro error hook.
   *
   * When enabled, exceptions are automatically sent to Sentry with additional data such as the transaction name and Nitro error context.
   * It's recommended to keep this enabled unless you need to implement a custom error handler.
   *
   * If you need a custom implementation, disable this option and refer to the default handler as a reference:
   * https://github.com/getsentry/sentry-javascript/blob/da8ba8d77a28b43da5014acc8dd98906d2180cc1/packages/nuxt/src/runtime/plugins/sentry.server.ts#L20-L46
   *
   * @default true
   */
  enableNitroErrorHandler?: boolean;
};

/**
 *  Build options for the Sentry module. These options are used during build-time by the Sentry SDK.
 */
export type SentryNuxtModuleOptions = SentryNitroOptions & {
  /**
   * Enable the Sentry Nuxt Module.
   *
   * @default true
   */
  enabled?: boolean;
};
