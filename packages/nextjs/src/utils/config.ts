/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSentryRelease } from '@sentry/node';
import { logger } from '@sentry/utils';
import defaultWebpackPlugin, { SentryCliPluginOptions } from '@sentry/webpack-plugin';
import * as SentryWebpackPlugin from '@sentry/webpack-plugin';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Starting at `startPath`, move up one directory at a time, searching for `searchFile`.
 *
 * @param startPath The location from which to start the search.
 * @param searchFile The file to search for
 * @returns The absolute path of the file, if it's found, or undefined if it's not
 */
function findUp(startPath: string, searchFile: string): string | undefined {
  if (!fs.existsSync(startPath)) {
    throw new Error(`The given \`startPath\` value (${startPath}) does not exist.`);
  }

  // if the last segment of `startPath` is a file, trim it off so that we start looking in its parent directory
  let currentDir = fs.statSync(startPath).isFile() ? path.dirname(startPath) : startPath;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const possiblePath = path.join(currentDir, searchFile);
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }

    const parentDir = path.resolve(currentDir, '..');
    // this means we've gotten to the root
    if (currentDir === parentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return undefined;
}

/**
 * Next requires that plugins be tagged with the same version number as the currently-running `next.js` package, so
 * modify our `package.json` to trick it into thinking we comply. Run before the plugin is loaded at server startup.
 */
export function syncPluginVersionWithNextVersion(): void {
  // TODO Once we get at least to TS 2.9, we can use `"resolveJsonModule": true` in our `compilerOptions` and we'll be
  // able to do:
  // import { version as nextVersion } from './node_modules/next/package.json';
  let nextVersion;

  try {
    // `require.resolve` returns the location of the packages `"main"` entry point, as specified in its `package.json`
    const nextResolvedMain = require.resolve('next');
    // since we don't know where in the package's directory that entry point is, search upward until we find a folder
    // containing `package.json`
    const nextPackageJsonPath = findUp(nextResolvedMain, 'package.json');
    nextVersion = nextPackageJsonPath && (require(nextPackageJsonPath) as { version: string }).version;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[next-plugin-sentry] Cannot read next.js version. Plug-in will not work.\nReceived error: ${err}`);
    return;
  }

  let pluginPackageJsonPath, pluginPackageJson;

  try {
    const pluginResolvedMain = require.resolve('@sentry/next-plugin-sentry');
    // see notes above about why we need to call `findUp`
    pluginPackageJsonPath = findUp(pluginResolvedMain, 'package.json');
    pluginPackageJson = pluginPackageJsonPath && require(pluginPackageJsonPath);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[next-plugin-sentry] Cannot find \`@sentry/next-plugin-sentry\`. Plug-in will not work. ` +
        `Please try reinstalling \`@sentry/nextjs\`.\nReceived error: ${err}`,
    );
    return;
  }

  (pluginPackageJson as { version: string }).version = nextVersion!;
  fs.writeFileSync(pluginPackageJsonPath!, JSON.stringify(pluginPackageJson));
}

type WebpackConfig = { devtool: string; plugins: Array<{ [key: string]: any }> };
type NextConfigExports = {
  experimental?: { plugins: boolean };
  plugins?: string[];
  productionBrowserSourceMaps?: boolean;
  webpack?: (config: WebpackConfig, { dev }: { dev: boolean }) => WebpackConfig;
};

export function withSentryConfig(
  providedExports: NextConfigExports = {},
  providedWebpackPluginOptions: Partial<SentryCliPluginOptions> = {},
): NextConfigExports {
  const defaultWebpackPluginOptions = {
    release: getSentryRelease(),
    url: process.env.SENTRY_URL,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    configFile: 'sentry.properties',
    stripPrefix: ['webpack://_N_E/'],
    urlPrefix: `~/_next`,
    include: '.next/',
    ignore: ['node_modules', 'webpack.config.js'],
  };
  const webpackPluginOptionOverrides = Object.keys(defaultWebpackPluginOptions)
    .concat('dryrun')
    .map(key => key in Object.keys(providedWebpackPluginOptions));
  if (webpackPluginOptionOverrides.length > 0) {
    logger.warn(
      '[next-plugin-sentry] You are overriding the following automatically-set SentryWebpackPlugin config options:\n' +
        `\t${webpackPluginOptionOverrides.toString()},\n` +
        "which has the possibility of breaking source map upload and application. This is only a good idea if you know what you're doing.",
    );
  }

  return {
    ...providedExports,
    experimental: { ...(providedExports.experimental || {}), plugins: true },
    plugins: [...(providedExports.plugins || []), '@sentry/next-plugin-sentry'],
    productionBrowserSourceMaps: true,
    webpack: (originalConfig, options) => {
      let config = originalConfig;

      if (typeof providedExports.webpack === 'function') {
        config = providedExports.webpack(originalConfig, options);
      }

      if (!options.dev) {
        // Ensure quality source maps in production. (Source maps aren't uploaded in dev, and besides, Next doesn't let
        // you change this is dev even if you want to - see
        // https://github.com/vercel/next.js/blob/master/errors/improper-devtool.md.)
        config.devtool = 'source-map';
      }
      config.plugins.push(
        // TODO it's not clear how to do this better, but there *must* be a better way
        new ((SentryWebpackPlugin as unknown) as typeof defaultWebpackPlugin)({
          dryRun: options.dev,
          ...defaultWebpackPluginOptions,
          ...providedWebpackPluginOptions,
        }),
      );

      return config;
    },
  };
}

try {
  syncPluginVersionWithNextVersion();
} catch (error) {
  logger.warn(`[next-plugin-sentry] Cannot sync plug-in and next versions. Plug-in may not work, versions must match.`);
  logger.warn('[next-plugin-sentry] A local project build should sync the versions, before deploying it.');
}
