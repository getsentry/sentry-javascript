import type { BuildTimeOptionsBase } from '@sentry/core';
import type { init as initNode } from '@sentry/node';
import type { SentryRollupPluginOptions } from '@sentry/rollup-plugin';
import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
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

type SourceMapsOptions = {
  /**
   * Suppresses all logs.
   *
   * @default false
   * @deprecated Use option `silent` instead of `sourceMapsUploadOptions.silent`
   */
  silent?: boolean;

  /**
   * When an error occurs during release creation or sourcemaps upload, the plugin will call this function.
   *
   * By default, the plugin will simply throw an error, thereby stopping the bundling process.
   * If an `errorHandler` callback is provided, compilation will continue, unless an error is
   * thrown in the provided callback.
   *
   * To allow compilation to continue but still emit a warning, set this option to the following:
   *
   * ```js
   * (err) => {
   *   console.warn(err);
   * }
   * ```
   *
   * @deprecated Use option `errorHandler` instead of `sourceMapsUploadOptions.errorHandler`
   */
  errorHandler?: (err: Error) => void;

  /**
   * Options related to managing the Sentry releases for a build.
   *
   * More info: https://docs.sentry.io/product/releases/
   *
   * @deprecated Use option `release` instead of `sourceMapsUploadOptions.release`
   */
  release?: {
    /**
     * Unique identifier for the release you want to create.
     *
     * This value can also be specified via the `SENTRY_RELEASE` environment variable.
     *
     * Defaults to automatically detecting a value for your environment.
     * This includes values for Cordova, Heroku, AWS CodeBuild, CircleCI, Xcode, and Gradle, and otherwise uses the git `HEAD`'s commit SHA.
     * (the latter requires access to git CLI and for the root directory to be a valid repository)
     *
     * If you didn't provide a value and the plugin can't automatically detect one, no release will be created.
     *
     * @deprecated Use `release.name` instead of `sourceMapsUploadOptions.release.name`
     */
    name?: string;
  };

  /**
   * If this flag is `true`, and an auth token is detected, the Sentry SDK will
   * automatically generate and upload source maps to Sentry during a production build.
   *
   * @default true
   * @deprecated Use option `sourcemaps.disable` instead of `sourceMapsUploadOptions.enabled`
   */
  enabled?: boolean;

  /**
   * The auth token to use when uploading source maps to Sentry.
   *
   * Instead of specifying this option, you can also set the `SENTRY_AUTH_TOKEN` environment variable.
   *
   * To create an auth token, follow this guide:
   * @see https://docs.sentry.io/product/accounts/auth-tokens/#organization-auth-tokens
   * @deprecated Use option `authToken` instead of `sourceMapsUploadOptions.authToken`
   */
  authToken?: string;

  /**
   * The organization slug of your Sentry organization.
   * Instead of specifying this option, you can also set the `SENTRY_ORG` environment variable.
   * @deprecated Use option `org` instead of `sourceMapsUploadOptions.org`
   */
  org?: string;

  /**
   * The URL of your Sentry instance if you're using self-hosted Sentry.
   *
   * @default https://sentry.io by default the plugin will point towards the Sentry SaaS URL
   * @deprecated Use `sentryUrl` instead of `sourceMapsUploadOptions.url`
   */
  url?: string;

  /**
   * The project slug of your Sentry project.
   * Instead of specifying this option, you can also set the `SENTRY_PROJECT` environment variable.
   *
   * @deprecated Use option `project` instead of `sourceMapsUploadOptions.project`
   */
  project?: string;

  /**
   * If this flag is `true`, the Sentry plugin will collect some telemetry data and send it to Sentry.
   * It will not collect any sensitive or user-specific data.
   *
   * @default true
   * @deprecated Use option `telemetry` instead of `sourceMapsUploadOptions.telemetry`
   */
  telemetry?: boolean;

  /**
   * Options related to sourcemaps
   *
   * @deprecated Use option `sourcemaps` instead of `sourceMapsUploadOptions.sourcemaps`
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
     *
     * @deprecated Use option `sourcemaps.assets` instead of `sourceMapsUploadOptions.sourcemaps.assets`
     */
    assets?: string | Array<string>;

    /**
     * A glob or an array of globs that specifies which build artifacts should not be uploaded to Sentry.
     *
     * @default [] - By default no files are ignored. Thus, all files matching the `assets` glob
     * or the default value for `assets` are uploaded.
     *
     * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
     *
     * @deprecated Use option `sourcemaps.ignore` instead of `sourceMapsUploadOptions.sourcemaps.ignore`
     */
    ignore?: string | Array<string>;

    /**
     * A glob or an array of globs that specifies the build artifacts that should be deleted after the artifact
     * upload to Sentry has been completed.
     *
     * @default [] - By default no files are deleted.
     *
     * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
     *
     * @deprecated Use option `sourcemaps.filesToDeleteAfterUpload` instead of `sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload`
     */
    filesToDeleteAfterUpload?: string | Array<string>;
  };
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
   * Options for the Sentry Vite plugin to customize the source maps upload process.
   *
   * These options are always read from the `sentry` module options in the `nuxt.config.(js|ts).
   * Do not define them in the `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.
   *
   * @deprecated  This option was deprecated as it adds unnecessary nesting.
   *              Put the options one level higher to the root-level of the `sentry` module options.
   */
  sourceMapsUploadOptions?: SourceMapsOptions;

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

  /**
   * Options to be passed directly to the Sentry Rollup Plugin (`@sentry/rollup-plugin`) and Sentry Vite Plugin (`@sentry/vite-plugin`) that ship with the Sentry Nuxt SDK.
   * You can use this option to override any options the SDK passes to the Vite (for Nuxt) and Rollup (for Nitro) plugin.
   *
   * Please note that this option is unstable and may change in a breaking way in any release.
   */
  unstable_sentryBundlerPluginOptions?: SentryRollupPluginOptions & SentryVitePluginOptions;
};
