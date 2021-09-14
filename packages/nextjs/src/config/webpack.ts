import { getSentryRelease } from '@sentry/node';
import { dropUndefinedKeys, logger } from '@sentry/utils';
import * as SentryWebpackPlugin from '@sentry/webpack-plugin';
import * as fs from 'fs';
import * as path from 'path';

import {
  BuildContext,
  EntryPointValue,
  EntryPropertyObject,
  NextConfigObject,
  SentryWebpackPluginOptions,
  WebpackConfigFunction,
  WebpackConfigObject,
  WebpackEntryProperty,
} from './types';

export { SentryWebpackPlugin };

// TODO: merge default SentryWebpackPlugin ignore with their SentryWebpackPlugin ignore or ignoreFile
// TODO: merge default SentryWebpackPlugin include with their SentryWebpackPlugin include
// TODO: drop merged keys from override check? `includeDefaults` option?

/**
 * Construct the function which will be used as the nextjs config's `webpack` value.
 *
 * Sets:
 *   - `devtool`, to ensure high-quality sourcemaps are generated
 *   - `entry`, to include user's sentry config files (where `Sentry.init` is called) in the build
 *   - `plugins`, to add SentryWebpackPlugin (TODO: optional)
 *
 * @param userNextConfig The user's existing nextjs config, as passed to `withSentryConfig`
 * @param userSentryWebpackPluginOptions The user's SentryWebpackPlugin config, as passed to `withSentryConfig`
 * @returns The function to set as the nextjs config's `webpack` value
 */
export function constructWebpackConfigFunction(
  userNextConfig: NextConfigObject = {},
  userSentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions> = {},
): WebpackConfigFunction {
  // Will be called by nextjs and passed its default webpack configuration and context data about the build (whether
  // we're building server or client, whether we're in dev, what version of webpack we're using, etc). Note that
  // `incomingConfig` and `buildContext` are referred to as `config` and `options` in the nextjs docs.
  const newWebpackFunction = (incomingConfig: WebpackConfigObject, buildContext: BuildContext): WebpackConfigObject => {
    let newConfig = { ...incomingConfig };

    // if user has custom webpack config (which always takes the form of a function), run it so we have actual values to
    // work with
    if ('webpack' in userNextConfig && typeof userNextConfig.webpack === 'function') {
      newConfig = userNextConfig.webpack(newConfig, buildContext);
    }

    // Tell webpack to inject user config files (containing the two `Sentry.init()` calls) into the appropriate output
    // bundles. Store a separate reference to the original `entry` value to avoid an infinite loop. (If we don't do
    // this, we'll have a statement of the form `x.y = () => f(x.y)`, where one of the things `f` does is call `x.y`.
    // Since we're setting `x.y` to be a callback (which, by definition, won't run until some time later), by the time
    // the function runs (causing `f` to run, causing `x.y` to run), `x.y` will point to the callback itself, rather
    // than its original value. So calling it will call the callback which will call `f` which will call `x.y` which
    // will call the callback which will call `f` which will call `x.y`... and on and on. Theoretically this could also
    // be fixed by using `bind`, but this is way simpler.)
    const origEntryProperty = newConfig.entry;
    newConfig.entry = async () => addSentryToEntryProperty(origEntryProperty, buildContext);

    // In webpack 5, you can get webpack to replace any module you'd like with an empty object, just by setting its
    // `resolve.alias` value to `false`. Not much of our code is neatly separated into "things node needs" and "things
    // the browser needs," but where it is, we can save ~1.6 kb in eventual bundle size by excluding code we know we
    // don't need. (Normally this would only matter for the client side, but because vercel turns backend code into
    // serverless functions, it's worthwhile to do it for both.)
    if (buildContext.webpack.version.startsWith('5')) {
      const excludedTracingDir = buildContext.isServer ? 'browser' : 'integrations/node';
      newConfig.resolve = {
        ...newConfig.resolve,
        alias: {
          ...newConfig.resolve?.alias,
          [path.resolve(buildContext.dir, `./node_modules/@sentry/tracing/esm/${excludedTracingDir}`)]: false,
          // TODO It's not clear if it will ever pull from `dist` (in testing it never does), so we may not need this.
          [path.resolve(buildContext.dir, `./node_modules/@sentry/tracing/dist/${excludedTracingDir}`)]: false,
        },
      };
    }

    // Enable the Sentry plugin (which uploads source maps to Sentry when not in dev) by default
    const enableWebpackPlugin = buildContext.isServer
      ? !userNextConfig.sentry?.disableServerWebpackPlugin
      : !userNextConfig.sentry?.disableClientWebpackPlugin;

    if (enableWebpackPlugin) {
      // TODO Handle possibility that user is using `SourceMapDevToolPlugin` (see
      // https://webpack.js.org/plugins/source-map-dev-tool-plugin/)
      // TODO Give user option to use `hidden-source-map` ?

      // Next doesn't let you change this is dev even if you want to - see
      // https://github.com/vercel/next.js/blob/master/errors/improper-devtool.md
      if (!buildContext.dev) {
        newConfig.devtool = 'source-map';
      }

      newConfig.plugins = newConfig.plugins || [];
      newConfig.plugins.push(
        // @ts-ignore Our types for the plugin are messed up somehow - TS wants this to be `SentryWebpackPlugin.default`,
        // but that's not actually a thing
        new SentryWebpackPlugin(getWebpackPluginOptions(buildContext, userSentryWebpackPluginOptions)),
      );
    }

    return newConfig;
  };

  return newWebpackFunction;
}

/**
 * Modify the webpack `entry` property so that the code in `sentry.server.config.js` and `sentry.client.config.js` is
 * included in the the necessary bundles.
 *
 * @param currentEntryProperty The value of the property before Sentry code has been injected
 * @param buildContext Object passed by nextjs containing metadata about the build
 * @returns The value which the new `entry` property (which will be a function) will return (TODO: this should return
 * the function, rather than the function's return value)
 */
async function addSentryToEntryProperty(
  currentEntryProperty: WebpackEntryProperty,
  buildContext: BuildContext,
): Promise<EntryPropertyObject> {
  // The `entry` entry in a webpack config can be a string, array of strings, object, or function. By default, nextjs
  // sets it to an async function which returns the promise of an object of string arrays. Because we don't know whether
  // someone else has come along before us and changed that, we need to check a few things along the way. The one thing
  // we know is that it won't have gotten *simpler* in form, so we only need to worry about the object and function
  // options. See https://webpack.js.org/configuration/entry-context/#entry.

  const newEntryProperty =
    typeof currentEntryProperty === 'function' ? await currentEntryProperty() : { ...currentEntryProperty };

  const userConfigFile = buildContext.isServer
    ? getUserConfigFile(buildContext.dir, 'server')
    : getUserConfigFile(buildContext.dir, 'client');

  for (const entryPointName in newEntryProperty) {
    if (shouldAddSentryToEntryPoint(entryPointName)) {
      // we need to turn the filename into a path so webpack can find it
      addFileToExistingEntryPoint(newEntryProperty, entryPointName, `./${userConfigFile}`);
    }
  }

  return newEntryProperty;
}

/**
 * Search the project directory for a valid user config file for the given platform, allowing for it to be either a
 * TypeScript or JavaScript file.
 *
 * @param projectDir The root directory of the project, where the file should be located
 * @param platform Either "server" or "client", so that we know which file to look for
 * @returns The name of the relevant file. If no file is found, this method throws an error.
 */
export function getUserConfigFile(projectDir: string, platform: 'server' | 'client'): string {
  const possibilities = [`sentry.${platform}.config.ts`, `sentry.${platform}.config.js`];

  for (const filename of possibilities) {
    if (fs.existsSync(path.resolve(projectDir, filename))) {
      return filename;
    }
  }

  throw new Error(`Cannot find '${possibilities[0]}' or '${possibilities[1]}' in '${projectDir}'.`);
}

/**
 * Add a file to a specific element of the given `entry` webpack config property.
 *
 * @param entryProperty The existing `entry` config object
 * @param entryPointName The key where the file should be injected
 * @param filepath The path to the injected file
 */
function addFileToExistingEntryPoint(
  entryProperty: EntryPropertyObject,
  entryPointName: string,
  filepath: string,
): void {
  // can be a string, array of strings, or object whose `import` property is one of those two
  const currentEntryPoint = entryProperty[entryPointName];
  let newEntryPoint: EntryPointValue;

  if (typeof currentEntryPoint === 'string') {
    newEntryPoint = [filepath, currentEntryPoint];
  } else if (Array.isArray(currentEntryPoint)) {
    newEntryPoint = [filepath, ...currentEntryPoint];
  }
  // descriptor object (webpack 5+)
  else if (typeof currentEntryPoint === 'object' && 'import' in currentEntryPoint) {
    const currentImportValue = currentEntryPoint.import;
    let newImportValue;

    if (typeof currentImportValue === 'string') {
      newImportValue = [filepath, currentImportValue];
    } else {
      newImportValue = [filepath, ...currentImportValue];
    }

    newEntryPoint = {
      ...currentEntryPoint,
      import: newImportValue,
    };
  } else {
    // mimic the logger prefix in order to use `console.warn` (which will always be printed, regardless of SDK settings)
    // eslint-disable-next-line no-console
    console.error(
      'Sentry Logger [Error]:',
      `Could not inject SDK initialization code into entry point ${entryPointName}, as it is not a recognized format.\n`,
      `Expected: string | Array<string> | { [key:string]: any, import: string | Array<string> }\n`,
      `Got: ${currentEntryPoint}`,
    );
    return;
  }

  entryProperty[entryPointName] = newEntryPoint;
}

/**
 * Check the SentryWebpackPlugin options provided by the user against the options we set by default, and warn if any of
 * our default options are getting overridden. (Note: If any of our default values is undefined, it won't be included in
 * the warning.)
 *
 * @param defaultOptions Default SentryWebpackPlugin options
 * @param userOptions The user's SentryWebpackPlugin options
 */
function checkWebpackPluginOverrides(
  defaultOptions: SentryWebpackPluginOptions,
  userOptions: Partial<SentryWebpackPluginOptions>,
): void {
  // warn if any of the default options for the webpack plugin are getting overridden
  const sentryWebpackPluginOptionOverrides = Object.keys(defaultOptions).filter(key => key in userOptions);
  if (sentryWebpackPluginOptionOverrides.length > 0) {
    logger.warn(
      '[Sentry] You are overriding the following automatically-set SentryWebpackPlugin config options:\n' +
        `\t${sentryWebpackPluginOptionOverrides.toString()},\n` +
        "which has the possibility of breaking source map upload and application. This is only a good idea if you know what you're doing.",
    );
  }
}

/**
 * Determine if this is an entry point into which both `Sentry.init()` code and the release value should be injected
 *
 * @param entryPointName The name of the entry point in question
 * @returns `true` if sentry code should be injected, and `false` otherwise
 */
function shouldAddSentryToEntryPoint(entryPointName: string): boolean {
  return entryPointName === 'pages/_app' || entryPointName.includes('pages/api');
}

/**
 * Combine default and user-provided SentryWebpackPlugin options, accounting for whether we're building server files or
 * client files.
 *
 * @param buildContext Nexjs-provided data about the current build
 * @param userPluginOptions User-provided SentryWebpackPlugin options
 * @returns Final set of combined options
 */
function getWebpackPluginOptions(
  buildContext: BuildContext,
  userPluginOptions: Partial<SentryWebpackPluginOptions>,
): SentryWebpackPluginOptions {
  const { isServer, dir: projectDir, buildId, dev: isDev, config: nextConfig, webpack } = buildContext;

  const isWebpack5 = webpack.version.startsWith('5');
  const isServerless = nextConfig.target === 'experimental-serverless-trace';
  const hasSentryProperties = fs.existsSync(path.resolve(projectDir, 'sentry.properties'));
  const urlPrefix = nextConfig.basePath ? `~${nextConfig.basePath}/_next` : '~/_next';

  const serverInclude = isServerless
    ? [{ paths: ['.next/serverless/'], urlPrefix: `${urlPrefix}/serverless` }]
    : [{ paths: ['.next/server/pages/'], urlPrefix: `${urlPrefix}/server/pages` }].concat(
        isWebpack5 ? [{ paths: ['.next/server/chunks/'], urlPrefix: `${urlPrefix}/server/chunks` }] : [],
      );

  const clientInclude = [{ paths: ['.next/static/chunks/pages'], urlPrefix: `${urlPrefix}/static/chunks/pages` }];

  const defaultPluginOptions = dropUndefinedKeys({
    include: isServer ? serverInclude : clientInclude,
    ignore: [],
    url: process.env.SENTRY_URL,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    configFile: hasSentryProperties ? 'sentry.properties' : undefined,
    stripPrefix: ['webpack://_N_E/'],
    urlPrefix,
    entries: shouldAddSentryToEntryPoint,
    release: getSentryRelease(buildId),
    dryRun: isDev,
  });

  checkWebpackPluginOverrides(defaultPluginOptions, userPluginOptions);

  return { ...defaultPluginOptions, ...userPluginOptions };
}
