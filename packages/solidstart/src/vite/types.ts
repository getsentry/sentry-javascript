import type { BuildTimeOptionsBase, UnstableVitePluginOptions } from '@sentry/core';
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';

/**
 *  Build options for the Sentry plugin. These options are used during build-time by the Sentry SDK.
 */
export type SentrySolidStartPluginOptions = BuildTimeOptionsBase &
  UnstableVitePluginOptions<Partial<SentryVitePluginOptions>> & {
    /**
     * The path to your `instrument.server.ts|js` file.
     * e.g. `./src/instrument.server.ts`
     *
     * Defaults to: `./src/instrument.server.ts`
     */
    instrumentation?: string;

    /**
     * The server entrypoint filename is automatically set by the Sentry SDK depending on the Nitro present.
     * In case the server entrypoint has a different filename, you can overwrite it here.
     */
    serverEntrypointFileName?: string;

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
  };
