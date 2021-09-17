import { ExportedNextConfig, NextConfigFunction, NextConfigObject, SentryWebpackPluginOptions } from './types';
import { constructWebpackConfigFunction } from './webpack';

/**
 * Add Sentry options to the config to be exported from the user's `next.config.js` file.
 *
 * @param userNextConfig The existing config to be exported prior to adding Sentry
 * @param userSentryWebpackPluginOptions Configuration for SentryWebpackPlugin
 * @returns The modified config to be exported
 */
export function withSentryConfig(
  userNextConfig: ExportedNextConfig = {},
  userSentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions> = {},
): NextConfigFunction | NextConfigObject {
  const webpackPluginOptionsWithSources = includeSources(userNextConfig, userSentryWebpackPluginOptions);

  // If the user has passed us a function, we need to return a function, so that we have access to `phase` and
  // `defaults` in order to pass them along to the user's function
  if (typeof userNextConfig === 'function') {
    return function(phase: string, defaults: { defaultConfig: NextConfigObject }): NextConfigObject {
      const materializedUserNextConfig = userNextConfig(phase, defaults);
      const sentryWebpackPluginOptionsWithSources = includeSources(
        materializedUserNextConfig,
        userSentryWebpackPluginOptions,
      );
      return {
        ...materializedUserNextConfig,
        webpack: constructWebpackConfigFunction(materializedUserNextConfig, sentryWebpackPluginOptionsWithSources),
      };
    };
  }

  // Otherwise, we can just merge their config with ours and return an object.
  return {
    ...userNextConfig,
    webpack: constructWebpackConfigFunction(userNextConfig, webpackPluginOptionsWithSources),
  };
}

function includeSources(
  nextConfig: ExportedNextConfig,
  sentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions>,
): Partial<SentryWebpackPluginOptions> {
  if (!nextConfig.distDir) {
    return sentryWebpackPluginOptions;
  }
  const usersInclude = sentryWebpackPluginOptions.include;

  let sourcesToInclude;
  if (typeof usersInclude === 'undefined') {
    sourcesToInclude = nextConfig.distDir;
  } else if (typeof usersInclude === 'string') {
    sourcesToInclude = [usersInclude, nextConfig.distDir];
  } else if (Array.isArray(usersInclude)) {
    sourcesToInclude = [...new Set(usersInclude.concat(nextConfig.distDir))];
  } else {
    // Object
    if (Array.isArray(usersInclude.paths)) {
      const uniquePaths = [...new Set(usersInclude.paths.concat(nextConfig.distDir))];
      sourcesToInclude = { ...usersInclude, paths: uniquePaths };
    } else if (typeof usersInclude.paths === 'undefined') {
      // eslint-disable-next-line no-console
      console.warn(
        'Sentry Logger [Warn]:',
        `An object was set in \`include\` but no \`paths\` was provided, so added the \`distDir\`: "${nextConfig.distDir}"\n` +
          'See https://github.com/getsentry/sentry-webpack-plugin#optionsinclude',
      );
      sourcesToInclude = { ...usersInclude, paths: [nextConfig.distDir] };
    } else {
      // eslint-disable-next-line no-console
      console.error(
        'Sentry Logger [Error]:',
        'Found unexpected object in `include.paths`\n' +
          'See https://github.com/getsentry/sentry-webpack-plugin#optionsinclude',
      );
      // Keep the same object even if it's incorrect, so that the user can get a more precise error from sentry-cli
      sourcesToInclude = usersInclude.paths;
    }
  }

  return { ...sentryWebpackPluginOptions, include: sourcesToInclude };
}
