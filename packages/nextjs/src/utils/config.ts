import { getSentryRelease } from '@sentry/node';
import { logger } from '@sentry/utils';
import defaultWebpackPlugin, { SentryCliPluginOptions } from '@sentry/webpack-plugin';
import * as SentryWebpackPlugin from '@sentry/webpack-plugin';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainObject<T = any> = { [key: string]: T };

// Man are these types hard to name well. "Entry" = an item in some collection of items, but in our case, one of the
// things we're worried about here is property (entry) in an object called... entry. So henceforth, the specific
// property we're modifying is going to be known as an EntryProperty.

// The function which is ultimately going to be exported from `next.config.js` under the name `webpack`
type WebpackExport = (config: WebpackConfig, options: WebpackOptions) => WebpackConfig;

// The two arguments passed to the exported `webpack` function, as well as the thing it returns
// TODO use real webpack types?
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebpackConfig = { devtool: string; plugins: PlainObject[]; entry: EntryProperty; module: { rules: any[] } };
type WebpackOptions = { dev: boolean; isServer: boolean; buildId: string };

// For our purposes, the value for `entry` is either an object, or a function which returns such an object
type EntryProperty = (() => Promise<EntryPropertyObject>) | EntryPropertyObject;

// Each value in that object is either a string representing a single entry point, an array of such strings, or an
// object containing either of those, along with other configuration options. In that third case, the entry point(s) are
// listed under the key `import`.
type EntryPropertyObject = PlainObject<string | Array<string> | EntryPointObject>;
type EntryPointObject = { import: string | Array<string> };

const sentryClientConfig = './sentry.client.config.js';
const sentryServerConfig = './sentry.server.config.js';

/** Add a file (`injectee`) to a given element (`injectionPoint`) of the `entry` property */
const _injectFile = (entryProperty: EntryPropertyObject, injectionPoint: string, injectee: string): void => {
  // can be a string, array of strings, or object whose `import` property is one of those two
  let injectedInto = entryProperty[injectionPoint];

  // Sometimes especially for older next.js versions it happens we don't have an entry point
  if (!injectedInto) {
    // eslint-disable-next-line no-console
    console.error(`[Sentry] Can't inject ${injectee}, no entrypoint is defined.`);
    return;
  }

  // We need to inject the user-provided config file after the frontend code so that it has access to the runtime config
  // (which won't have loaded yet otherwise). See: https://github.com/getsentry/sentry-javascript/issues/3485. On the
  // server side, we inject beforehand so that we can catch any errors in the code that follows.
  const isClient = injectee === sentryClientConfig;

  if (typeof injectedInto === 'string') {
    injectedInto = isClient ? [injectedInto, injectee] : [injectee, injectedInto];
  } else if (Array.isArray(injectedInto)) {
    injectedInto = isClient ? [...injectedInto, injectee] : [injectee, ...injectedInto];
  } else {
    let importVal: string | string[] | EntryPointObject;
    if (typeof injectedInto.import === 'string') {
      importVal = isClient ? [injectedInto.import, injectee] : [injectee, injectedInto.import];
    } else {
      // If it's not a string, the inner value is an array
      importVal = isClient ? [...injectedInto.import, injectee] : [injectee, ...injectedInto.import];
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
  // On the server, we need to inject the SDK into both into the base page (`_document`) and into individual API routes
  // (which have no common base).
  if (isServer) {
    Object.keys(newEntryProperty).forEach(key => {
      if (key === 'pages/_document' || key.includes('pages/api')) {
        // for some reason, because we're now in a function, we have to cast again
        _injectFile(newEntryProperty as EntryPropertyObject, key, sentryServerConfig);
      }
    });
  }
  // On the client, it's sufficient to inject it into the `main` JS code, which is included in every browser page.
  else {
    _injectFile(newEntryProperty, 'main', sentryClientConfig);
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

export function withSentryConfig(
  providedExports: NextConfigExports = {},
  providedWebpackPluginOptions: Partial<SentryCliPluginOptions> = {},
): NextConfigExports {
  const defaultWebpackPluginOptions = {
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

  // warn if any of the default options for the webpack plugin are getting overridden
  const webpackPluginOptionOverrides = Object.keys(defaultWebpackPluginOptions)
    .concat('dryrun')
    .map(key => key in Object.keys(providedWebpackPluginOptions));
  if (webpackPluginOptionOverrides.length > 0) {
    logger.warn(
      '[Sentry] You are overriding the following automatically-set SentryWebpackPlugin config options:\n' +
        `\t${webpackPluginOptionOverrides.toString()},\n` +
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

    // Wherever the webpack process ultimately runs, it's not somewhere where modules resolve successfully, so get the
    // absolute paths here, where resolution does work, and pass those into the config instead of the module names
    const sdkResolvedMain = require.resolve('@sentry/nextjs');
    const loaderPath = path.join(path.dirname(sdkResolvedMain), 'utils/api-wrapping-loader.js');
    const babelLoaderResolvedMain = require.resolve('babel-loader');
    const babelPluginResolvedMain = require.resolve('@babel/plugin-transform-modules-commonjs');

    newConfig.module = {
      ...newConfig.module,
      rules: [
        ...newConfig.module.rules,
        {
          test: /pages\/api\/.*/,
          use: [
            {
              // `sdkResolvedMain` is the path to `dist/index.server.js`
              loader: loaderPath,
              options: {
                // pass the path into the loader so it can be used there as well (it's another place where modules don't
                // resolve well)
                sdkPath: sdkResolvedMain,
              },
            },
            {
              loader: babelLoaderResolvedMain,
              options: {
                // this is here to turn any `import`s into `requires`, so that our loader can load the string as a
                // module (loaders apply top to bottom, so this happens before ours)
                plugins: [babelPluginResolvedMain],
              },
            },
          ],
        },
      ],
    };

    // Inject user config files (`sentry.client.confg.js` and `sentry.server.config.js`), which is where `Sentry.init()`
    // is called. By adding them here, we ensure that they're bundled by webpack as part of both server code and client code.
    newConfig.entry = (injectSentry(newConfig.entry, options.isServer) as unknown) as EntryProperty;

    // Add the Sentry plugin, which uploads source maps to Sentry when not in dev
    newConfig.plugins.push(
      // TODO it's not clear how to do this better, but there *must* be a better way
      new ((SentryWebpackPlugin as unknown) as typeof defaultWebpackPlugin)({
        dryRun: options.dev,
        release: getSentryRelease(options.buildId),
        ...defaultWebpackPluginOptions,
        ...providedWebpackPluginOptions,
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
