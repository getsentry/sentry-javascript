import type { SentryVitePluginOptions } from '@sentry/vite-plugin';

type SourceMapsOptions = {
  /**
   * If this flag is `true`, and an auth token is detected, the Sentry SDK will
   * automatically generate and upload source maps to Sentry during a production build.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * If this flag is `true`, the Sentry plugin will collect some telemetry data and send it to Sentry.
   * It will not collect any sensitive or user-specific data.
   *
   * @default true
   */
  telemetry?: boolean;

  /**
   * A glob or an array of globs that specifies the build artifacts that should be deleted after the artifact
   * upload to Sentry has been completed.
   *
   * @default [] - By default no files are deleted.
   *
   * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
   */
  filesToDeleteAfterUpload?: string | Array<string>;

  /**
   * Options to further customize the Sentry Vite Plugin (@sentry/vite-plugin) behavior directly.
   * Options specified in this object take precedence over the options specified in
   * the `sourcemaps` and `release` objects.
   *
   * @see https://www.npmjs.com/package/@sentry/vite-plugin/v/2.22.2#options which lists all available options.
   *
   * Warning: Options within this object are subject to change at any time.
   * We DO NOT guarantee semantic versioning for these options, meaning breaking
   * changes can occur at any time within a major SDK version.
   *
   * Furthermore, some options are untested with SvelteKit specifically. Use with caution.
   */
  unstable_sentryVitePluginOptions?: Partial<SentryVitePluginOptions>;
};

type BundleSizeOptimizationOptions = {
  /**
   * If set to `true`, the plugin will attempt to tree-shake (remove) any debugging code within the Sentry SDK.
   * Note that the success of this depends on tree shaking being enabled in your build tooling.
   *
   * Setting this option to `true` will disable features like the SDK's `debug` option.
   */
  excludeDebugStatements?: boolean;

  /**
   * If set to true, the plugin will try to tree-shake tracing statements out.
   * Note that the success of this depends on tree shaking generally being enabled in your build.
   * Attention: DO NOT enable this when you're using any performance monitoring-related SDK features (e.g. Sentry.startSpan()).
   */
  excludeTracing?: boolean;

  /**
   * If set to `true`, the plugin will attempt to tree-shake (remove) code related to the Sentry SDK's Session Replay Shadow DOM recording functionality.
   * Note that the success of this depends on tree shaking being enabled in your build tooling.
   *
   * This option is safe to be used when you do not want to capture any Shadow DOM activity via Sentry Session Replay.
   */
  excludeReplayShadowDom?: boolean;

  /**
   * If set to `true`, the plugin will attempt to tree-shake (remove) code related to the Sentry SDK's Session Replay `iframe` recording functionality.
   * Note that the success of this depends on tree shaking being enabled in your build tooling.
   *
   * You can safely do this when you do not want to capture any `iframe` activity via Sentry Session Replay.
   */
  excludeReplayIframe?: boolean;

  /**
   * If set to `true`, the plugin will attempt to tree-shake (remove) code related to the Sentry SDK's Session Replay's Compression Web Worker.
   * Note that the success of this depends on tree shaking being enabled in your build tooling.
   *
   * **Notice:** You should only do use this option if you manually host a compression worker and configure it in your Sentry Session Replay integration config via the `workerUrl` option.
   */
  excludeReplayWorker?: boolean;
};

/**
 *  Build options for the Sentry plugin. These options are used during build-time by the Sentry SDK.
 */
export type SentrySolidStartPluginOptions = {
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
   * Options for the Sentry Vite plugin to customize the source maps upload process.
   */
  sourceMapsUploadOptions?: SourceMapsOptions;

  /**
   * Options for the Sentry Vite plugin to customize bundle size optimizations.
   */
  bundleSizeOptimizations?: BundleSizeOptimizationOptions;

  /**
   * Enable debug functionality of the SDK during build-time.
   * Enabling this will give you, for example logs about source maps.
   */
  debug?: boolean;

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
