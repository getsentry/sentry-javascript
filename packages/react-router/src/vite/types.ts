import type { BuildTimeOptionsBase, UnstableVitePluginOptions } from '@sentry/core';
import type { SentryVitePluginOptions } from '@sentry/vite-plugin';

type SourceMapsOptions = {
  /**
   * If this flag is `true`, and an auth token is detected, the Sentry SDK will
   * automatically generate and upload source maps to Sentry during a production build.
   *
   * @default true
   * @deprecated Use `sourcemaps.disable` option instead of `sourceMapsUploadOptions.enabled`.
   */
  enabled?: boolean;

  /**
   * A glob or an array of globs that specifies the build artifacts that should be deleted after the artifact
   * upload to Sentry has been completed.
   *
   * @default [] - By default no files are deleted.
   *
   * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
   *
   * @deprecated Use `sourcemaps.filesToDeleteAfterUpload` option instead of `sourceMapsUploadOptions.filesToDeleteAfterUpload`.
   */
  filesToDeleteAfterUpload?: string | Array<string>;

  /**
   * Options related to managing the Sentry releases for a build.
   *
   * More info: https://docs.sentry.io/product/releases/
   *
   * @deprecated Use the `release` option at the root of `SentryVitePluginOptions` instead.
   */
  // todo(v11): Remove this option (currently it's not in use either, but it's kept to not cause a breaking change)
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

export type SentryReactRouterBuildOptions = BuildTimeOptionsBase &
  UnstableVitePluginOptions<Partial<SentryVitePluginOptions>> & {
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
    // todo(v11): Remove this option (all options already exist in BuildTimeOptionsBase)
  };
