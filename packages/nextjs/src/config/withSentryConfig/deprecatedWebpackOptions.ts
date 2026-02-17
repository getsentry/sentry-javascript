import type { SentryBuildOptions } from '../types';
import { detectActiveBundler } from '../util';

/**
 * Migrates deprecated top-level webpack options to the new `webpack.*` path for backward compatibility.
 * The new path takes precedence over deprecated options. This mutates the userSentryOptions object.
 */
export function migrateDeprecatedWebpackOptions(userSentryOptions: SentryBuildOptions): void {
  // Initialize webpack options if not present
  userSentryOptions.webpack = userSentryOptions.webpack || {};

  const webpack = userSentryOptions.webpack;

  const withDeprecatedFallback = <T>(
    newValue: T | undefined,
    deprecatedValue: T | undefined,
    message: string,
  ): T | undefined => {
    if (deprecatedValue !== undefined) {
      // eslint-disable-next-line no-console
      console.warn(message);
    }

    return newValue ?? deprecatedValue;
  };

  const deprecatedMessage = (deprecatedPath: string, newPath: string): string => {
    const message = `[@sentry/nextjs] DEPRECATION WARNING: ${deprecatedPath} is deprecated and will be removed in a future version. Use ${newPath} instead.`;

    // In Turbopack builds, webpack configuration is not applied, so webpack-scoped options won't have any effect.
    if (detectActiveBundler() === 'turbopack' && newPath.startsWith('webpack.')) {
      return `${message} (Not supported with Turbopack.)`;
    }

    return message;
  };

  /* eslint-disable deprecation/deprecation */
  // Migrate each deprecated option to the new path, but only if the new path isn't already set
  webpack.autoInstrumentServerFunctions = withDeprecatedFallback(
    webpack.autoInstrumentServerFunctions,
    userSentryOptions.autoInstrumentServerFunctions,
    deprecatedMessage('autoInstrumentServerFunctions', 'webpack.autoInstrumentServerFunctions'),
  );

  webpack.autoInstrumentMiddleware = withDeprecatedFallback(
    webpack.autoInstrumentMiddleware,
    userSentryOptions.autoInstrumentMiddleware,
    deprecatedMessage('autoInstrumentMiddleware', 'webpack.autoInstrumentMiddleware'),
  );

  webpack.autoInstrumentAppDirectory = withDeprecatedFallback(
    webpack.autoInstrumentAppDirectory,
    userSentryOptions.autoInstrumentAppDirectory,
    deprecatedMessage('autoInstrumentAppDirectory', 'webpack.autoInstrumentAppDirectory'),
  );

  webpack.excludeServerRoutes = withDeprecatedFallback(
    webpack.excludeServerRoutes,
    userSentryOptions.excludeServerRoutes,
    deprecatedMessage('excludeServerRoutes', 'webpack.excludeServerRoutes'),
  );

  webpack.unstable_sentryWebpackPluginOptions = withDeprecatedFallback(
    webpack.unstable_sentryWebpackPluginOptions,
    userSentryOptions.unstable_sentryWebpackPluginOptions,
    deprecatedMessage('unstable_sentryWebpackPluginOptions', 'webpack.unstable_sentryWebpackPluginOptions'),
  );

  webpack.disableSentryConfig = withDeprecatedFallback(
    webpack.disableSentryConfig,
    userSentryOptions.disableSentryWebpackConfig,
    deprecatedMessage('disableSentryWebpackConfig', 'webpack.disableSentryConfig'),
  );

  // Handle treeshake.removeDebugLogging specially since it's nested
  if (userSentryOptions.disableLogger !== undefined) {
    webpack.treeshake = webpack.treeshake || {};
    webpack.treeshake.removeDebugLogging = withDeprecatedFallback(
      webpack.treeshake.removeDebugLogging,
      userSentryOptions.disableLogger,
      deprecatedMessage('disableLogger', 'webpack.treeshake.removeDebugLogging'),
    );
  }

  webpack.automaticVercelMonitors = withDeprecatedFallback(
    webpack.automaticVercelMonitors,
    userSentryOptions.automaticVercelMonitors,
    deprecatedMessage('automaticVercelMonitors', 'webpack.automaticVercelMonitors'),
  );

  webpack.reactComponentAnnotation = withDeprecatedFallback(
    webpack.reactComponentAnnotation,
    userSentryOptions.reactComponentAnnotation,
    deprecatedMessage('reactComponentAnnotation', 'webpack.reactComponentAnnotation'),
  );
}
