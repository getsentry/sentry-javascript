import type { init as initNode } from '@sentry/node';
import type { SentryRollupPluginOptions } from '@sentry/rollup-plugin';
import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import type { init as initVue } from '@sentry/vue';

// Omitting 'app' as the Nuxt SDK will add the app instance in the client plugin (users do not have to provide this)
export type SentryNuxtClientOptions = Omit<Parameters<typeof initVue>[0] & object, 'app'>;
export type SentryNuxtServerOptions = Omit<Parameters<typeof initNode>[0] & object, 'app'>;

type SourceMapsOptions = {
  /**
   * If this flag is `true`, and an auth token is detected, the Sentry SDK will
   * automatically generate and upload source maps to Sentry during a production build.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * The auth token to use when uploading source maps to Sentry.
   *
   * Instead of specifying this option, you can also set the `SENTRY_AUTH_TOKEN` environment variable.
   *
   * To create an auth token, follow this guide:
   * @see https://docs.sentry.io/product/accounts/auth-tokens/#organization-auth-tokens
   */
  authToken?: string;

  /**
   * The organization slug of your Sentry organization.
   * Instead of specifying this option, you can also set the `SENTRY_ORG` environment variable.
   */
  org?: string;

  /**
   * The project slug of your Sentry project.
   * Instead of specifying this option, you can also set the `SENTRY_PROJECT` environment variable.
   */
  project?: string;

  /**
   * If this flag is `true`, the Sentry plugin will collect some telemetry data and send it to Sentry.
   * It will not collect any sensitive or user-specific data.
   *
   * @default true
   */
  telemetry?: boolean;

  /**
   * Options related to sourcemaps
   */
  sourcemaps?: {
    /**
     * A glob or an array of globs that specify the build artifacts and source maps that will be uploaded to Sentry.
     *
     * If this option is not specified, sensible defaults based on your adapter and nuxt.config.js
     * setup will be used. Use this option to override these defaults, for instance if you have a
     * customized build setup that diverges from Nuxt's defaults.
     *
     * The globbing patterns must follow the implementation of the `glob` package.
     * @see https://www.npmjs.com/package/glob#glob-primer
     */
    assets?: string | Array<string>;

    /**
     * A glob or an array of globs that specifies which build artifacts should not be uploaded to Sentry.
     *
     * @default [] - By default no files are ignored. Thus, all files matching the `assets` glob
     * or the default value for `assets` are uploaded.
     *
     * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
     */
    ignore?: string | Array<string>;

    /**
     * A glob or an array of globs that specifies the build artifacts that should be deleted after the artifact
     * upload to Sentry has been completed.
     *
     * @default [] - By default no files are deleted.
     *
     * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
     */
    filesToDeleteAfterUpload?: string | Array<string>;
  };
};

/**
 *  Build options for the Sentry module. These options are used during build-time by the Sentry SDK.
 */
export type SentryNuxtModuleOptions = {
  /**
   * Options for the Sentry Vite plugin to customize the source maps upload process.
   *
   * These options are always read from the `sentry` module options in the `nuxt.config.(js|ts).
   * Do not define them in the `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.
   */
  sourceMapsUploadOptions?: SourceMapsOptions;

  /**
   * Enable debug functionality of the SDK during build-time.
   * Enabling this will give you, for example, logs about source maps.
   */
  debug?: boolean;

  /**
   * Wraps the server entry file with a dynamic `import()`. This will make it possible to preload Sentry and register
   * necessary hooks before other code runs. (Node docs: https://nodejs.org/api/module.html#enabling)
   *
   * If this option is `false`, the Sentry SDK won't wrap the server entry file with `import()`. Not wrapping the
   * server entry file will disable Sentry on the server-side. When you set this option to `false`, make sure
   * to add the Sentry server config with the node `--import` CLI flag to enable Sentry on the server-side.
   *
   * **DO NOT** add the node CLI flag `--import` in your node start script, when `dynamicImportForServerEntry` is set to `true` (default).
   * This would initialize Sentry twice on the server-side and this leads to unexpected issues.
   *
   * @default true
   */
  dynamicImportForServerEntry?: boolean;

  /**
   * By default—unless you configure `dynamicImportForServerEntry: false`—the SDK will try to wrap your Nitro server entrypoint
   * with a dynamic `import()` to ensure all dependencies can be properly instrumented. Any previous exports from the entrypoint are still exported.
   * Most exports of the server entrypoint are serverless functions and those are wrapped by Sentry. Other exports stay as-is.
   *
   * By default, the SDK will wrap the default export as well as a `handler` or `server` export from the entrypoint.
   * If your server has a different main export that is used to run the server, you can overwrite this by providing an array of export names to wrap.
   * Any wrapped export is expected to be an async function.
   *
   * @default ['default', 'handler', 'server']
   */
  entrypointWrappedFunctions?: string[];

  /**
   * Options to be passed directly to the Sentry Rollup Plugin (`@sentry/rollup-plugin`) and Sentry Vite Plugin (`@sentry/vite-plugin`) that ship with the Sentry Nuxt SDK.
   * You can use this option to override any options the SDK passes to the Vite (for Nuxt) and Rollup (for Nitro) plugin.
   *
   * Please note that this option is unstable and may change in a breaking way in any release.
   */
  unstable_sentryBundlerPluginOptions?: SentryRollupPluginOptions & SentryVitePluginOptions;
};
