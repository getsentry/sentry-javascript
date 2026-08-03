import type { BuildTimeOptionsBase } from '@sentry/core';
import type { init as initNode } from '@sentry/node';
import type { SentryRollupPluginOptions } from '@sentry/bundler-plugins/rollup';
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
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
export type SentryNuxtModuleOptions = BuildTimeOptionsBase & {
  /**
   * Enable the Sentry Nuxt Module.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   *
   * Enables (partial) server tracing by automatically injecting Sentry for environments where modifying the node option `--import` is not possible.
   *
   * **DO NOT** add the node CLI flag `--import` in your node start script, when auto-injecting Sentry.
   * This would initialize Sentry twice on the server-side and this leads to unexpected issues.
   *
   * ---
   *
   * **"top-level-import"**
   *
   * Enabling basic server tracing with top-level import can be used for environments where modifying the node option `--import` is not possible.
   * However, enabling this option only supports limited tracing instrumentation. Only http traces will be collected (but no database-specific traces etc.).
   *
   * If `"top-level-import"` is enabled, the Sentry SDK will import the Sentry server config at the top of the server entry file to load the SDK on the server.
   *
   * ---
   * **"experimental_dynamic-import"**
   *
   * Wraps the server entry file with a dynamic `import()`. This will make it possible to preload Sentry and register
   * necessary hooks before other code runs. (Node docs: https://nodejs.org/api/module.html#enabling)
   *
   * If `"experimental_dynamic-import"` is enabled, the Sentry SDK wraps the server entry file with `import()`.
   *
   * @default undefined
   */
  autoInjectServerSentry?: 'top-level-import' | 'experimental_dynamic-import';

  /**
   * Provide the resolved path to a custom Sentry client config file.
   *
   * If not provided, the default location (`<projectRoot>/sentry.(client|server).config.(js|ts)`) will be used to look up the config file.
   * If there is no file at the default location either, the SDK won't be initialized.
   *
   * Resolves the full path to a file or directory, respecting Nuxt alias and extensions options.
   * @example
   *
   * ```ts
   * sentry: {
   *   configDir: '~/sentry-config',
   *   // Sentry will search for `<rootDir>/<srcDir>/sentry-config/sentry.(client|server).config.(js|ts)` files.
   * }
   * ```
   */
  configDir?: string;

  /**
   * When `autoInjectServerSentry` is set to `"experimental_dynamic-import"`, the SDK will wrap your Nitro server entrypoint
   * with a dynamic `import()` to ensure all dependencies can be properly instrumented. Any previous exports from the entrypoint are still exported.
   * Most exports of the server entrypoint are serverless functions and those are wrapped by Sentry. Other exports stay as-is.
   *
   * By default, the SDK will wrap the default export as well as a `handler` or `server` export from the entrypoint.
   * If your server has a different main export that is used to run the server, you can overwrite this by providing an array of export names to wrap.
   * Any wrapped export is expected to be an async function.
   *
   * @default ['default', 'handler', 'server']
   */
  experimental_entrypointWrappedFunctions?: string[];

  /**
   * Options to be passed directly to the Sentry Rollup Plugin (`@sentry/bundler-plugins/rollup`) and Sentry Vite Plugin (`@sentry/bundler-plugins/vite`) that ship with the Sentry Nuxt SDK.
   * You can use this option to override any options the SDK passes to the Vite (for Nuxt) and Rollup (for Nitro) plugin.
   *
   * Please note that this option is unstable and may change in a breaking way in any release.
   */
  unstable_sentryBundlerPluginOptions?: SentryRollupPluginOptions & SentryVitePluginOptions;
};
