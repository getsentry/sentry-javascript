import { getSentryRelease } from '@sentry/node';
import { logger } from '@sentry/utils';
import defaultWebpackPlugin, { SentryCliPluginOptions } from '@sentry/webpack-plugin';
import * as SentryWebpackPlugin from '@sentry/webpack-plugin';

const SENTRY_CLIENT_CONFIG_FILE = './sentry.client.config.js';
const SENTRY_SERVER_CONFIG_FILE = './sentry.server.config.js';
// this is where the transpiled/bundled version of `USER_SERVER_CONFIG_FILE` will end up
export const SERVER_INIT_OUTPUT_LOCATION = 'sentry/serverInit';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainObject<T = any> = { [key: string]: T };

// The function which is ultimately going to be exported from `next.config.js` under the name `webpack`
type WebpackExport = (config: WebpackConfig, options: WebpackOptions) => WebpackConfig;

// The two arguments passed to the exported `webpack` function, as well as the thing it returns
type WebpackConfig = { devtool: string; plugins: PlainObject[]; entry: EntryProperty; output: { path: string } };
type WebpackOptions = { dev: boolean; isServer: boolean; buildId: string };

// For our purposes, the value for `entry` is either an object, or a function which returns such an object
type EntryProperty = (() => Promise<EntryPropertyObject>) | EntryPropertyObject;
// Each value in that object is either a string representing a single entry point, an array of such strings, or an
// object containing either of those, along with other configuration options. In that third case, the entry point(s) are
// listed under the key `import`.
type EntryPropertyObject = PlainObject<string> | PlainObject<Array<string>> | PlainObject<EntryPointObject>;
type EntryPointObject = { import: string | Array<string> };

/**
 * Add a file to a specific element of the given `entry` webpack config property.
 *
 * @param entryProperty The existing `entry` config object
 * @param injectionPoint The key where the file should be injected
 * @param injectee The path to the injected file
 */
const _injectFile = (entryProperty: EntryPropertyObject, injectionPoint: string, injectee: string): void => {
  // can be a string, array of strings, or object whose `import` property is one of those two
  let injectedInto = entryProperty[injectionPoint];

  // Sometimes especially for older next.js versions it happens we don't have an entry point
  if (!injectedInto) {
    // eslint-disable-next-line no-console
    console.error(`[Sentry] Can't inject ${injectee}, no entrypoint is defined.`);
    return;
  }

  // We inject the user's client config file after the existing code so that the config file has access to
  // `publicRuntimeConfig`. See https://github.com/getsentry/sentry-javascript/issues/3485
  if (typeof injectedInto === 'string') {
    injectedInto = [injectedInto, injectee];
  } else if (Array.isArray(injectedInto)) {
    injectedInto = [...injectedInto, injectee];
  } else {
    let importVal: string | string[];

    if (typeof injectedInto.import === 'string') {
      importVal = [injectedInto.import, injectee];
    } else {
      importVal = [...injectedInto.import, injectee];
    }

    injectedInto = {
      ...injectedInto,
      import: importVal,
    };
  }

  entryProperty[injectionPoint] = injectedInto;
};

const injectSentry = async (origEntryProperty: EntryProperty, isServer: boolean): Promise<EntryProperty> => {
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
  if (isServer) {
    newEntryProperty[SERVER_INIT_OUTPUT_LOCATION] = SENTRY_SERVER_CONFIG_FILE;
  }
  // On the client, it's sufficient to inject it into the `main` JS code, which is included in every browser page.
  else {
    _injectFile(newEntryProperty, 'main', SENTRY_CLIENT_CONFIG_FILE);
  }
  // TODO: hack made necessary because the async-ness of this function turns our object back into a promise, meaning the
  // internal `next` code which should do this doesn't
  if ('main.js' in newEntryProperty) {
    delete newEntryProperty['main.js'];
  }
  return newEntryProperty;
};

type NextConfigExports = {
  experimental?: { plugins: boolean };
  plugins?: string[];
  productionBrowserSourceMaps?: boolean;
  webpack?: WebpackExport;
};

/**
 * Add Sentry options to the config to be exported from the user's `next.config.js` file.
 *
 * @param providedExports The existing config to be exported ,prior to adding Sentry
 * @param providedSentryWebpackPluginOptions Configuration for SentryWebpackPlugin
 * @returns The modified config to be exported
 */
export function withSentryConfig(
  providedExports: NextConfigExports = {},
  providedSentryWebpackPluginOptions: Partial<SentryCliPluginOptions> = {},
): NextConfigExports {
  const defaultSentryWebpackPluginOptions = {
    url: process.env.SENTRY_URL,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    configFile: 'sentry.properties',
    stripPrefix: ['webpack://_N_E/'],
    urlPrefix: `~/_next`,
    include: '.next/',
    ignore: ['.next/cache', 'server/ssr-module-cache.js', 'static/*/_ssgManifest.js', 'static/*/_buildManifest.js'],
  };

  // warn if any of the default options for the webpack plugin are getting overridden
  const sentryWebpackPluginOptionOverrides = Object.keys(defaultSentryWebpackPluginOptions)
    .concat('dryrun')
    .filter(key => key in Object.keys(providedSentryWebpackPluginOptions));
  if (sentryWebpackPluginOptionOverrides.length > 0) {
    logger.warn(
      '[Sentry] You are overriding the following automatically-set SentryWebpackPlugin config options:\n' +
        `\t${sentryWebpackPluginOptionOverrides.toString()},\n` +
        "which has the possibility of breaking source map upload and application. This is only a good idea if you know what you're doing.",
    );
  }

  const newWebpackExport = (config: WebpackConfig, options: WebpackOptions): WebpackConfig => {
    let newConfig = config;

    if (typeof providedExports.webpack === 'function') {
      newConfig = providedExports.webpack(config, options);
    }

    // Ensure quality source maps in production. (Source maps aren't uploaded in dev, and besides, Next doesn't let you
    // change this is dev even if you want to - see
    // https://github.com/vercel/next.js/blob/master/errors/improper-devtool.md.)
    if (!options.dev) {
      newConfig.devtool = 'source-map';
    }

    // Inject user config files (`sentry.client.confg.js` and `sentry.server.config.js`), which is where `Sentry.init()`
    // is called. By adding them here, we ensure that they're bundled by webpack as part of both server code and client code.
    newConfig.entry = (injectSentry(newConfig.entry, options.isServer) as unknown) as EntryProperty;

    // Add the Sentry plugin, which uploads source maps to Sentry when not in dev
    newConfig.plugins.push(
      // TODO it's not clear how to do this better, but there *must* be a better way
      new ((SentryWebpackPlugin as unknown) as typeof defaultWebpackPlugin)({
        dryRun: options.dev,
        release: getSentryRelease(options.buildId),
        ...defaultSentryWebpackPluginOptions,
        ...providedSentryWebpackPluginOptions,
      }),
    );

    return newConfig;
  };

  return {
    ...providedExports,
    productionBrowserSourceMaps: true,
    webpack: newWebpackExport,
  };
}
