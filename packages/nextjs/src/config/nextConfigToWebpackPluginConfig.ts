import { NextConfigObject, SentryWebpackPluginOptions } from './types';

/**
 * Creates a new Sentry Webpack Plugin config with the `distDir` option from Next.js config
 * in the `include` property.
 *
 * If no `distDir` is provided, the Webpack Plugin config doesn't change.
 * If no `include` has been defined defined, the `distDir` value is assigned.
 * The `distDir` directory is merged to the directories in `include`, if defined.
 * Duplicated paths are removed while merging.
 *
 * @param nextConfig User's Next.js config
 * @param sentryWebpackPluginOptions User's Sentry Webpack Plugin config
 * @returns New Sentry Webpack Plugin config
 */
export function includeDistDir(
  nextConfig: NextConfigObject,
  sentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions>,
): Partial<SentryWebpackPluginOptions> {
  if (!nextConfig.distDir) {
    return { ...sentryWebpackPluginOptions };
  }
  // It's assumed `distDir` is a string as that's what Next.js is expecting. If it's not, Next.js itself will complain
  const usersInclude = sentryWebpackPluginOptions.include;

  let sourcesToInclude;
  if (typeof usersInclude === 'undefined') {
    sourcesToInclude = nextConfig.distDir;
  } else if (typeof usersInclude === 'string') {
    sourcesToInclude = usersInclude === nextConfig.distDir ? usersInclude : [usersInclude, nextConfig.distDir];
  } else if (Array.isArray(usersInclude)) {
    // @ts-ignore '__spreadArray' import from tslib, ts(2343)
    sourcesToInclude = [...new Set(usersInclude.concat(nextConfig.distDir))];
  } else {
    // Object
    if (Array.isArray(usersInclude.paths)) {
      const uniquePaths = [...new Set(usersInclude.paths.concat(nextConfig.distDir as string))];
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
      // Casting to `any` for TS not complaining about it being `unknown`
      sourcesToInclude = usersInclude as any;
    }
  }

  return { ...sentryWebpackPluginOptions, include: sourcesToInclude };
}
