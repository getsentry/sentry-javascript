import type { BuildTimeOptionsBase, ReactComponentAnnotationOptions } from '@sentry/core';

/**
 * `resolveSourceMap` is a bundler-plugin hook, applied during the plugin's own debug ID upload.
 * React Router keeps the Vite plugin's source map handling disabled and uploads through `SentryCli`
 * in `sentryOnBuildEnd` instead, so there is nowhere to apply the hook - it is omitted rather than
 * accepted and silently ignored.
 */
type SourceMapsOptions = Omit<NonNullable<BuildTimeOptionsBase['sourcemaps']>, 'resolveSourceMap'>;

export type SentryReactRouterBuildOptions = Omit<BuildTimeOptionsBase, 'sourcemaps'> & {
  /**
   * Options related to source maps upload and processing.
   */
  sourcemaps?: SourceMapsOptions;

  /**
   * Options related to react component name annotations.
   * Disabled by default, unless a value is set for this option.
   * When enabled, your app's DOM will automatically be annotated during build-time with their respective component names.
   * This will unlock the capability to search for Replays in Sentry by component name, as well as see component names in breadcrumbs and performance monitoring.
   * Please note that this feature is not currently supported by the esbuild bundler plugins, and will only annotate React components
   */
  reactComponentAnnotation?: ReactComponentAnnotationOptions;
};
