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
   * A glob or an array of globs that specifies the build artifacts that should be deleted after the artifact
   * upload to Sentry has been completed.
   *
   * @default [] - By default no files are deleted.
   *
   * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
   */
  filesToDeleteAfterUpload?: string | Array<string>;

  /**
   * Options related to managing the Sentry releases for a build.
   *
   * More info: https://docs.sentry.io/product/releases/
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
     */
    name?: string;
  };
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

export type SentryReactRouterBuildOptions = {
  /**
   * Options for configuring the Sentry release.
   */
  release?: {
    /**
     * The name of the release to create in Sentry
     */
    name?: string;
  };

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
   * Options for the Sentry Vite plugin to customize bundle size optimizations.
   */
  bundleSizeOptimizations?: BundleSizeOptimizationOptions;

  /**
   * If this flag is `true`, Sentry will log debug information during build time.
   * @default false.
   */
  debug?: boolean;

  /**
   * Options related to react component name annotations.
   * Disabled by default, unless a value is set for this option.
   * When enabled, your app's DOM will automatically be annotated during build-time with their respective component names.
   * This will unlock the capability to search for Replays in Sentry by component name, as well as see component names in breadcrumbs and performance monitoring.
   * Please note that this feature is not currently supported by the esbuild bundler plugins, and will only annotate React components
   */
  reactComponentAnnotation?: {
    /**
     * Whether the component name annotate plugin should be enabled or not.
     */
    enabled?: boolean;

    /**
     * A list of strings representing the names of components to ignore. The plugin will not apply `data-sentry` annotations on the DOM element for these components.
     */
    ignoredComponents?: string[];
  };

  /**
   * Options for the Sentry Vite plugin to customize the source maps upload process.
   *
   */
  sourceMapsUploadOptions?: SourceMapsOptions;

  /**
   * If this flag is `true`, the Sentry plugin will collect some telemetry data and send it to Sentry.
   * It will not collect any sensitive or user-specific data.
   *
   * @default true
   */
  telemetry?: boolean;

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
