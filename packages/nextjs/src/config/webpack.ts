import { getSentryRelease } from '@sentry/node';
import { dropUndefinedKeys, logger } from '@sentry/utils';
import * as SentryWebpackPlugin from '@sentry/webpack-plugin';

import {
  BuildContext,
  EntryPointObject,
  EntryPropertyObject,
  ExportedNextConfig,
  SentryWebpackPluginOptions,
  WebpackConfigFunction,
  WebpackConfigObject,
  WebpackEntryProperty,
} from './types';
import {
  SENTRY_CLIENT_CONFIG_FILE,
  SENTRY_SERVER_CONFIG_FILE,
  SERVER_SDK_INIT_PATH,
  storeServerConfigFileLocation,
} from './utils';

export { SentryWebpackPlugin };

// TODO: merge default SentryWebpackPlugin ignore with their SentryWebpackPlugin ignore or ignoreFile
// TODO: merge default SentryWebpackPlugin include with their SentryWebpackPlugin include
// TODO: drop merged keys from override check? `includeDefaults` option?

const defaultSentryWebpackPluginOptions = dropUndefinedKeys({
  url: process.env.SENTRY_URL,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  configFile: 'sentry.properties',
  stripPrefix: ['webpack://_N_E/'],
  urlPrefix: `~/_next`,
  include: '.next/',
  ignore: ['.next/cache', 'server/ssr-module-cache.js', 'static/*/_ssgManifest.js', 'static/*/_buildManifest.js'],
});

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
  userNextConfig: ExportedNextConfig = {},
  userSentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions> = {},
): WebpackConfigFunction {
  const newWebpackFunction = (config: WebpackConfigObject, options: BuildContext): WebpackConfigObject => {
    // if we're building server code, store the webpack output path as an env variable, so we know where to look for the
    // webpack-processed version of `sentry.server.config.js` when we need it
    if (config.target === 'node') {
      storeServerConfigFileLocation(config);
    }

    let newConfig = config;

    // if user has custom webpack config (which always takes the form of a function), run it so we have actual values to
    // work with
    if ('webpack' in userNextConfig && typeof userNextConfig.webpack === 'function') {
      newConfig = userNextConfig.webpack(config, options);
    }

    // Ensure quality source maps in production. (Source maps aren't uploaded in dev, and besides, Next doesn't let you
    // change this is dev even if you want to - see
    // https://github.com/vercel/next.js/blob/master/errors/improper-devtool.md.)
    if (!options.dev) {
      // TODO Handle possibility that user is using `SourceMapDevToolPlugin` (see
      // https://webpack.js.org/plugins/source-map-dev-tool-plugin/)
      // TODO Give user option to use `hidden-source-map` ?
      newConfig.devtool = 'source-map';
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
    newConfig.entry = async () => addSentryToEntryProperty(origEntryProperty, options.isServer);

    // Add the Sentry plugin, which uploads source maps to Sentry when not in dev
    checkWebpackPluginOverrides(userSentryWebpackPluginOptions);
    newConfig.plugins = newConfig.plugins || [];
    newConfig.plugins.push(
      // @ts-ignore Our types for the plugin are messed up somehow - TS wants this to be `SentryWebpackPlugin.default`,
      // but that's not actually a thing
      new SentryWebpackPlugin({
        dryRun: options.dev,
        release: getSentryRelease(options.buildId),
        ...defaultSentryWebpackPluginOptions,
        ...userSentryWebpackPluginOptions,
      }),
    );

    return newConfig;
  };

  return newWebpackFunction;
}

/**
 * Modify the webpack `entry` property so that the code in `sentry.server.config.js` and `sentry.client.config.js` is
 * included in the the necessary bundles.
 *
 * @param origEntryProperty The value of the property before Sentry code has been injected
 * @param isServer A boolean provided by nextjs indicating whether we're handling the server bundles or the browser
 * bundles
 * @returns The value which the new `entry` property (which will be a function) will return (TODO: this should return
 * the function, rather than the function's return value)
 */
async function addSentryToEntryProperty(
  origEntryProperty: WebpackEntryProperty,
  isServer: boolean,
): Promise<EntryPropertyObject> {
  // The `entry` entry in a webpack config can be a string, array of strings, object, or function. By default, nextjs
  // sets it to an async function which returns the promise of an object of string arrays. Because we don't know whether
  // someone else has come along before us and changed that, we need to check a few things along the way. The one thing
  // we know is that it won't have gotten *simpler* in form, so we only need to worry about the object and function
  // options. See https://webpack.js.org/configuration/entry-context/#entry.

  let newEntryProperty = origEntryProperty;
  if (typeof origEntryProperty === 'function') {
    newEntryProperty = await origEntryProperty();
  }
  newEntryProperty = newEntryProperty as EntryPropertyObject;

  // Add a new element to the `entry` array, we force webpack to create a bundle out of the user's
  // `sentry.server.config.js` file and output it to `SERVER_INIT_LOCATION`. (See
  // https://webpack.js.org/guides/code-splitting/#entry-points.) We do this so that the user's config file is run
  // through babel (and any other processors through which next runs the rest of the user-provided code - pages, API
  // routes, etc.). Specifically, we need any ESM-style `import` code to get transpiled into ES5, so that we can call
  // `require()` on the resulting file when we're instrumenting the sesrver. (We can't use a dynamic import there
  // because that then forces the user into a particular TS config.)

  // On the server, create a separate bundle, as there's no one entry point depended on by all the others
  if (isServer) {
    // slice off the final `.js` since webpack is going to add it back in for us, and we don't want to end up with
    // `.js.js` as the extension
    newEntryProperty[SERVER_SDK_INIT_PATH.slice(0, -3)] = SENTRY_SERVER_CONFIG_FILE;
  }
  // On the client, it's sufficient to inject it into the `main` JS code, which is included in every browser page.
  else {
    addFileToExistingEntryPoint(newEntryProperty, 'main', SENTRY_CLIENT_CONFIG_FILE);

    // To work around a bug in nextjs, we need to ensure that the `main.js` entry is empty (otherwise it'll choose that
    // over `main` and we'll lose the change we just made). In case some other library has put something into it, copy
    // its contents over before emptying it out. See
    // https://github.com/getsentry/sentry-javascript/pull/3696#issuecomment-863363803.)
    const mainjsValue = newEntryProperty['main.js'];
    if (Array.isArray(mainjsValue) && mainjsValue.length > 0) {
      const mainValue = newEntryProperty.main;

      // copy the `main.js` entries over
      newEntryProperty.main = Array.isArray(mainValue)
        ? [...mainjsValue, ...mainValue]
        : { ...(mainValue as EntryPointObject), import: [...mainjsValue, ...(mainValue as EntryPointObject).import] };

      // nuke the entries
      newEntryProperty['main.js'] = [];
    }
  }

  return newEntryProperty;
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
  let injectedInto = entryProperty[entryPointName];

  // Sometimes especially for older next.js versions it happens we don't have an entry point
  if (!injectedInto) {
    // eslint-disable-next-line no-console
    console.error(`[Sentry] Can't inject ${filepath}, no entrypoint is defined.`);
    return;
  }

  // We inject the user's client config file after the existing code so that the config file has access to
  // `publicRuntimeConfig`. See https://github.com/getsentry/sentry-javascript/issues/3485
  if (typeof injectedInto === 'string') {
    injectedInto = [injectedInto, filepath];
  } else if (Array.isArray(injectedInto)) {
    injectedInto = [...injectedInto, filepath];
  } else {
    let importVal: string | string[];

    if (typeof injectedInto.import === 'string') {
      importVal = [injectedInto.import, filepath];
    } else {
      importVal = [...injectedInto.import, filepath];
    }

    injectedInto = {
      ...injectedInto,
      import: importVal,
    };
  }

  entryProperty[entryPointName] = injectedInto;
}

/**
 * Check the SentryWebpackPlugin options provided by the user against the options we set by default, and warn if any of
 * our default options are getting overridden. (Note: If any of our default values is undefined, it won't be included in
 * the warning.)
 *
 * @param userSentryWebpackPluginOptions The user's SentryWebpackPlugin options
 */
function checkWebpackPluginOverrides(userSentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions>): void {
  // warn if any of the default options for the webpack plugin are getting overridden
  const sentryWebpackPluginOptionOverrides = Object.keys(defaultSentryWebpackPluginOptions)
    .concat('dryrun')
    .filter(key => key in userSentryWebpackPluginOptions);
  if (sentryWebpackPluginOptionOverrides.length > 0) {
    logger.warn(
      '[Sentry] You are overriding the following automatically-set SentryWebpackPlugin config options:\n' +
        `\t${sentryWebpackPluginOptionOverrides.toString()},\n` +
        "which has the possibility of breaking source map upload and application. This is only a good idea if you know what you're doing.",
    );
  }
}
