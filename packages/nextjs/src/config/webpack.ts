/* eslint-disable complexity */
/* eslint-disable max-lines */
import { getSentryRelease } from '@sentry/node';
import { arrayify, dropUndefinedKeys, escapeStringForRegex, logger } from '@sentry/utils';
import { default as SentryWebpackPlugin } from '@sentry/webpack-plugin';
import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

// Note: If you need to import a type from Webpack, do it in `types.ts` and export it from there. Otherwise, our
// circular dependency check thinks this file is importing from itself. See https://github.com/pahen/madge/issues/306.
import type {
  BuildContext,
  NextConfigObject,
  SentryWebpackPluginOptions,
  UserSentryOptions,
  WebpackConfigFunction,
  WebpackConfigObject,
  WebpackConfigObjectWithModuleRules,
  WebpackModuleRule,
} from './types';

// TODO: merge default SentryWebpackPlugin ignore with their SentryWebpackPlugin ignore or ignoreFile
// TODO: merge default SentryWebpackPlugin include with their SentryWebpackPlugin include
// TODO: drop merged keys from override check? `includeDefaults` option?

/**
 * Construct the function which will be used as the nextjs config's `webpack` value.
 *
 * Sets:
 *   - `devtool`, to ensure high-quality sourcemaps are generated
 *   - `entry`, to include user's sentry config files (where `Sentry.init` is called) in the build
 *   - `plugins`, to add SentryWebpackPlugin
 *
 * @param userNextConfig The user's existing nextjs config, as passed to `withSentryConfig`
 * @param userSentryWebpackPluginOptions The user's SentryWebpackPlugin config, as passed to `withSentryConfig`
 * @returns The function to set as the nextjs config's `webpack` value
 */
export function constructWebpackConfigFunction(
  userNextConfig: NextConfigObject = {},
  userSentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions> = {},
  userSentryOptions: UserSentryOptions = {},
): WebpackConfigFunction {
  // Will be called by nextjs and passed its default webpack configuration and context data about the build (whether
  // we're building server or client, whether we're in dev, what version of webpack we're using, etc). Note that
  // `incomingConfig` and `buildContext` are referred to as `config` and `options` in the nextjs docs.
  return function newWebpackFunction(
    incomingConfig: WebpackConfigObject,
    buildContext: BuildContext,
  ): WebpackConfigObject {
    const { isServer, dev: isDev, dir: projectDir } = buildContext;
    const runtime = isServer ? (buildContext.nextRuntime === 'edge' ? 'edge' : 'node') : 'browser';

    let rawNewConfig = { ...incomingConfig };

    // if user has custom webpack config (which always takes the form of a function), run it so we have actual values to
    // work with
    if ('webpack' in userNextConfig && typeof userNextConfig.webpack === 'function') {
      rawNewConfig = userNextConfig.webpack(rawNewConfig, buildContext);
    }

    // This mutates `rawNewConfig` in place, but also returns it in order to switch its type to one in which
    // `newConfig.module.rules` is required, so we don't have to keep asserting its existence
    const newConfig = setUpModuleRules(rawNewConfig);

    // Add a loader which will inject code that sets global values
    addValueInjectionLoader(newConfig, userNextConfig, userSentryOptions, buildContext);

    newConfig.module.rules.push({
      test: /node_modules[/\\]@sentry[/\\]nextjs/,
      use: [
        {
          loader: path.resolve(__dirname, 'loaders', 'sdkMultiplexerLoader.js'),
          options: {
            importTarget: { browser: './client', node: './server', edge: './edge' }[runtime],
          },
        },
      ],
    });

    const absoluteSdkConfigPath = path.join(
      projectDir,
      `sentry.${{ browser: 'client', node: 'server', edge: 'edge' }[runtime]}.config`,
    );
    const absoluteJsSdkConfigPath = `${absoluteSdkConfigPath}.js`;
    const absoluteTsSdkConfigPath = `${absoluteSdkConfigPath}.ts`;

    let pagesDirPath: string;
    if (fs.existsSync(path.join(projectDir, 'pages')) && fs.lstatSync(path.join(projectDir, 'pages')).isDirectory()) {
      pagesDirPath = path.join(projectDir, 'pages');
    } else {
      pagesDirPath = path.join(projectDir, 'src', 'pages');
    }

    // Default page extensions per https://github.com/vercel/next.js/blob/f1dbc9260d48c7995f6c52f8fbcc65f08e627992/packages/next/server/config-shared.ts#L161
    const pageExtensions = userNextConfig.pageExtensions || ['tsx', 'ts', 'jsx', 'js'];
    const dotPrefixedPageExtensions = pageExtensions.map(ext => `.${ext}`);
    const pageExtensionRegex = pageExtensions.map(escapeStringForRegex).join('|');

    const jsSdkConfigExists = fs.existsSync(absoluteJsSdkConfigPath);
    const tsSdkConfigExists = fs.existsSync(absoluteTsSdkConfigPath);

    if (jsSdkConfigExists || tsSdkConfigExists) {
      newConfig.module.rules.push({
        test: resourcePath => {
          const allowedFileExtensions = ['.js', '.ts', '.jsx', '.tsx'];
          return (
            allowedFileExtensions.some(extension => resourcePath.endsWith(extension)) &&
            !resourcePath.match(/[/\\]node_modules[/\\]/) &&
            resourcePath !== absoluteJsSdkConfigPath &&
            resourcePath !== absoluteTsSdkConfigPath
          );
        },
        use: [
          {
            loader: path.resolve(__dirname, 'loaders', 'sdkConfigInjectionLoader.js'),
            options: {
              absoluteSdkConfigPath: tsSdkConfigExists ? absoluteTsSdkConfigPath : absoluteJsSdkConfigPath,
            },
          },
        ],
      });
    }

    if (isServer && userSentryOptions.autoInstrumentServerFunctions !== false) {
      const middlewareJsPath = path.join(pagesDirPath, '..', 'middleware.js');
      const middlewareTsPath = path.join(pagesDirPath, '..', 'middleware.ts');

      // It is very important that we insert our loader at the beginning of the array because we expect any sort of transformations/transpilations (e.g. TS -> JS) to already have happened.
      newConfig.module.rules.unshift({
        test: resourcePath => {
          // We generally want to apply the loader to all API routes, pages and to the middleware file.

          // `resourcePath` may be an absolute path or a path relative to the context of the webpack config
          let absoluteResourcePath: string;
          if (path.isAbsolute(resourcePath)) {
            absoluteResourcePath = resourcePath;
          } else {
            absoluteResourcePath = path.join(projectDir, resourcePath);
          }
          const normalizedAbsoluteResourcePath = path.normalize(absoluteResourcePath);

          if (
            // Match everything inside pages/ with the appropriate file extension
            normalizedAbsoluteResourcePath.startsWith(pagesDirPath) &&
            dotPrefixedPageExtensions.some(ext => normalizedAbsoluteResourcePath.endsWith(ext))
          ) {
            return true;
          } else if (
            // Match middleware.js and middleware.ts
            normalizedAbsoluteResourcePath === middlewareJsPath ||
            normalizedAbsoluteResourcePath === middlewareTsPath
          ) {
            return userSentryOptions.autoInstrumentMiddleware ?? true;
          } else {
            return false;
          }
        },
        use: [
          {
            loader: path.resolve(__dirname, 'loaders', 'wrappingLoader.js'),
            options: {
              pagesDir: pagesDirPath,
              pageExtensionRegex,
              excludeServerRoutes: userSentryOptions.excludeServerRoutes,
            },
          },
        ],
      });
    }

    // The SDK uses syntax (ES6 and ES6+ features like object spread) which isn't supported by older browsers. For users
    // who want to support such browsers, `transpileClientSDK` allows them to force the SDK code to go through the same
    // transpilation that their code goes through. We don't turn this on by default because it increases bundle size
    // fairly massively.
    if (!isServer && userSentryOptions?.transpileClientSDK) {
      // Find all loaders which apply transpilation to user code
      const transpilationRules = findTranspilationRules(newConfig.module?.rules, projectDir);

      // For each matching rule, wrap its `exclude` function so that it won't exclude SDK files, even though they're in
      // `node_modules` (which is otherwise excluded)
      transpilationRules.forEach(rule => {
        // All matching rules will necessarily have an `exclude` property, but this keeps TS happy
        if (rule.exclude && typeof rule.exclude === 'function') {
          const origExclude = rule.exclude;

          const newExclude = (filepath: string): boolean => {
            if (filepath.includes('@sentry')) {
              // `false` in this case means "don't exclude it"
              return false;
            }
            return origExclude(filepath);
          };

          rule.exclude = newExclude;
        }
      });
    }

    // Enable the Sentry plugin (which uploads source maps to Sentry when not in dev) by default
    if (shouldEnableWebpackPlugin(buildContext, userSentryOptions)) {
      // TODO Handle possibility that user is using `SourceMapDevToolPlugin` (see
      // https://webpack.js.org/plugins/source-map-dev-tool-plugin/)

      // TODO (v9 or v10, maybe): Remove this
      handleSourcemapHidingOptionWarning(userSentryOptions, isServer);

      // Next doesn't let you change `devtool` in dev even if you want to, so don't bother trying - see
      // https://github.com/vercel/next.js/blob/master/errors/improper-devtool.md
      if (!isDev) {
        // TODO (v8): Default `hideSourceMaps` to `true`

        // `hidden-source-map` produces the same sourcemaps as `source-map`, but doesn't include the `sourceMappingURL`
        // comment at the bottom. For folks who aren't publicly hosting their sourcemaps, this is helpful because then
        // the browser won't look for them and throw errors into the console when it can't find them. Because this is a
        // front-end-only problem, and because `sentry-cli` handles sourcemaps more reliably with the comment than
        // without, the option to use `hidden-source-map` only applies to the client-side build.
        newConfig.devtool = userSentryOptions.hideSourceMaps && !isServer ? 'hidden-source-map' : 'source-map';
      }

      newConfig.plugins = newConfig.plugins || [];
      newConfig.plugins.push(
        new SentryWebpackPlugin(
          getWebpackPluginOptions(buildContext, userSentryWebpackPluginOptions, userSentryOptions),
        ),
      );
    }

    return newConfig;
  };
}

/**
 * Determine if this `module.rules` entry is one which will transpile user code
 *
 * @param rule The rule to check
 * @param projectDir The path to the user's project directory
 * @returns True if the rule transpiles user code, and false otherwise
 */
function isMatchingRule(rule: WebpackModuleRule, projectDir: string): boolean {
  // We want to run our SDK code through the same transformations the user's code will go through, so we test against a
  // sample user code path
  const samplePagePath = path.resolve(projectDir, 'pageFile.js');
  if (rule.test && rule.test instanceof RegExp && !rule.test.test(samplePagePath)) {
    return false;
  }
  if (Array.isArray(rule.include) && !rule.include.includes(projectDir)) {
    return false;
  }

  // `rule.use` can be an object or an array of objects. For simplicity, force it to be an array.
  const useEntries = arrayify(rule.use);

  // Depending on the version of nextjs we're talking about, the loader which does the transpiling is either
  //
  //   'next-babel-loader' (next 10),
  //   '/abs/path/to/node_modules/next/more/path/babel/even/more/path/loader/yet/more/path/index.js' (next 11), or
  //   'next-swc-loader' (next 12).
  //
  // The next 11 option is ugly, but thankfully 'next', 'babel', and 'loader' do appear in it in the same order as in
  // 'next-babel-loader', so we can use the same regex to test for both.
  if (!useEntries.some(entry => entry?.loader && new RegExp('next.*(babel|swc).*loader').test(entry.loader))) {
    return false;
  }

  return true;
}

/**
 * Find all rules in `module.rules` which transpile user code.
 *
 * @param rules The `module.rules` value
 * @param projectDir The path to the user's project directory
 * @returns An array of matching rules
 */
function findTranspilationRules(rules: WebpackModuleRule[] | undefined, projectDir: string): WebpackModuleRule[] {
  if (!rules) {
    return [];
  }

  const matchingRules: WebpackModuleRule[] = [];

  // Each entry in `module.rules` is either a rule in and of itself or an object with a `oneOf` property, whose value is
  // an array of rules
  rules.forEach(rule => {
    // if (rule.oneOf) {
    if (isMatchingRule(rule, projectDir)) {
      matchingRules.push(rule);
    } else if (rule.oneOf) {
      const matchingOneOfRules = rule.oneOf.filter(oneOfRule => isMatchingRule(oneOfRule, projectDir));
      matchingRules.push(...matchingOneOfRules);
      // } else if (isMatchingRule(rule, projectDir)) {
    }
  });

  return matchingRules;
}

/**
 * Search the project directory for a valid user config file for the given platform, allowing for it to be either a
 * TypeScript or JavaScript file.
 *
 * @param projectDir The root directory of the project, where the file should be located
 * @param platform Either "server", "client" or "edge", so that we know which file to look for
 * @returns The name of the relevant file. If the server or client file is not found, this method throws an error. The
 * edge file is optional, if it is not found this function will return `undefined`.
 */
export function getUserConfigFile(projectDir: string, platform: 'server' | 'client' | 'edge'): string | undefined {
  const possibilities = [`sentry.${platform}.config.ts`, `sentry.${platform}.config.js`];

  for (const filename of possibilities) {
    if (fs.existsSync(path.resolve(projectDir, filename))) {
      return filename;
    }
  }

  // Edge config file is optional
  if (platform === 'edge') {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] You are using Next.js features that run on the Edge Runtime. Please add a "sentry.edge.config.js" or a "sentry.edge.config.ts" file to your project root in which you initialize the Sentry SDK with "Sentry.init()".',
    );
    return;
  } else {
    throw new Error(`Cannot find '${possibilities[0]}' or '${possibilities[1]}' in '${projectDir}'.`);
  }
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
    __DEBUG_BUILD__ &&
      logger.warn(
        '[Sentry] You are overriding the following automatically-set SentryWebpackPlugin config options:\n' +
          `\t${sentryWebpackPluginOptionOverrides.toString()},\n` +
          "which has the possibility of breaking source map upload and application. This is only a good idea if you know what you're doing.",
      );
  }
}

/**
 * Combine default and user-provided SentryWebpackPlugin options, accounting for whether we're building server files or
 * client files.
 *
 * @param buildContext Nexjs-provided data about the current build
 * @param userPluginOptions User-provided SentryWebpackPlugin options
 * @returns Final set of combined options
 */
export function getWebpackPluginOptions(
  buildContext: BuildContext,
  userPluginOptions: Partial<SentryWebpackPluginOptions>,
  userSentryOptions: UserSentryOptions,
): SentryWebpackPluginOptions {
  const { buildId, isServer, webpack, config, dev: isDev, dir: projectDir } = buildContext;
  const userNextConfig = config as NextConfigObject;

  const distDirAbsPath = path.resolve(projectDir, userNextConfig.distDir || '.next'); // `.next` is the default directory

  const isWebpack5 = webpack.version.startsWith('5');
  const isServerless = userNextConfig.target === 'experimental-serverless-trace';
  const hasSentryProperties = fs.existsSync(path.resolve(projectDir, 'sentry.properties'));
  const urlPrefix = '~/_next';

  const serverInclude = isServerless
    ? [{ paths: [`${distDirAbsPath}/serverless/`], urlPrefix: `${urlPrefix}/serverless` }]
    : [
        { paths: [`${distDirAbsPath}/server/pages/`], urlPrefix: `${urlPrefix}/server/pages` },
        { paths: [`${distDirAbsPath}/server/app/`], urlPrefix: `${urlPrefix}/server/app` },
      ].concat(
        isWebpack5 ? [{ paths: [`${distDirAbsPath}/server/chunks/`], urlPrefix: `${urlPrefix}/server/chunks` }] : [],
      );

  const clientInclude = userSentryOptions.widenClientFileUpload
    ? [{ paths: [`${distDirAbsPath}/static/chunks`], urlPrefix: `${urlPrefix}/static/chunks` }]
    : [
        { paths: [`${distDirAbsPath}/static/chunks/pages`], urlPrefix: `${urlPrefix}/static/chunks/pages` },
        { paths: [`${distDirAbsPath}/static/chunks/app`], urlPrefix: `${urlPrefix}/static/chunks/app` },
      ];

  const defaultPluginOptions = dropUndefinedKeys({
    include: isServer ? serverInclude : clientInclude,
    ignore:
      isServer || !userSentryOptions.widenClientFileUpload
        ? []
        : // Widening the upload scope is necessarily going to lead to us uploading files we don't need to (ones which
          // don't include any user code). In order to lessen that where we can, exclude the internal nextjs files we know
          // will be there.
          ['framework-*', 'framework.*', 'main-*', 'polyfills-*', 'webpack-*'],
    url: process.env.SENTRY_URL,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    configFile: hasSentryProperties ? 'sentry.properties' : undefined,
    stripPrefix: ['webpack://_N_E/'],
    urlPrefix,
    entries: [], // The webpack plugin's release injection breaks the `app` directory - we inject the release manually with the value injection loader instead.
    release: getSentryRelease(buildId),
    dryRun: isDev,
  });

  checkWebpackPluginOverrides(defaultPluginOptions, userPluginOptions);

  return { ...defaultPluginOptions, ...userPluginOptions };
}

/** Check various conditions to decide if we should run the plugin */
function shouldEnableWebpackPlugin(buildContext: BuildContext, userSentryOptions: UserSentryOptions): boolean {
  const { isServer, dev: isDev } = buildContext;
  const { disableServerWebpackPlugin, disableClientWebpackPlugin } = userSentryOptions;

  /** Non-negotiable */

  // This check is necessary because currently, `@sentry/cli` uses a post-install script to download an
  // architecture-specific version of the `sentry-cli` binary. If `yarn install`, `npm install`, or `npm ci` are run
  // with the `--ignore-scripts` option, this will be blocked and the missing binary will cause an error when users
  // try to build their apps.
  if (!SentryWebpackPlugin.cliBinaryExists()) {
    return false;
  }

  /** User override */

  if (isServer && disableServerWebpackPlugin !== undefined) {
    return !disableServerWebpackPlugin;
  } else if (!isServer && disableClientWebpackPlugin !== undefined) {
    return !disableClientWebpackPlugin;
  }

  /** Situations where the default is to disable the plugin */

  // TODO: Are there analogs to Vercel's preveiw and dev modes on other deployment platforms?

  if (isDev || process.env.NODE_ENV === 'development') {
    // TODO (v8): Right now in dev we set the plugin to dryrun mode, and our boilerplate includes setting the plugin to
    // `silent`, so for the vast majority of users, it's as if the plugin doesn't run at all in dev. Making that
    // official is technically a breaking change, though, so we probably should wait until v8.
    // return false
  }

  if (process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development') {
    return false;
  }

  // We've passed all of the tests!
  return true;
}

/** Handle warning messages about `hideSourceMaps` option. Can be removed in v9 or v10 (or whenever we consider that
 * enough people will have upgraded the SDK that the warning about the default in v8 - currently commented out - is
 * overkill). */
function handleSourcemapHidingOptionWarning(userSentryOptions: UserSentryOptions, isServer: boolean): void {
  // This is nextjs's own logging formatting, vendored since it's not exported. See
  // https://github.com/vercel/next.js/blob/c3ceeb03abb1b262032bd96457e224497d3bbcef/packages/next/build/output/log.ts#L3-L11
  // and
  // https://github.com/vercel/next.js/blob/de7aa2d6e486c40b8be95a1327639cbed75a8782/packages/next/lib/eslint/runLintCheck.ts#L321-L323.
  const codeFormat = (str: string): string => chalk.bold.cyan(str);

  const _warningPrefix_ = `${chalk.yellow('warn')}  -`;
  const _sentryNextjs_ = codeFormat('@sentry/nextjs');
  const _hideSourceMaps_ = codeFormat('hideSourceMaps');
  const _true_ = codeFormat('true');
  const _false_ = codeFormat('false');
  const _sentry_ = codeFormat('sentry');
  const _nextConfigJS_ = codeFormat('next.config.js');

  if (isServer && userSentryOptions.hideSourceMaps === undefined) {
    // eslint-disable-next-line no-console
    console.warn(
      `\n${_warningPrefix_} In order to be able to deminify errors, ${_sentryNextjs_} creates sourcemaps and uploads ` +
        'them to the Sentry server. Depending on your deployment setup, this means your original code may be visible ' +
        `in browser devtools in production. To prevent this, set ${_hideSourceMaps_} to ${_true_} in the ${_sentry_} ` +
        `options in your ${_nextConfigJS_}. To disable this warning without changing sourcemap behavior, set ` +
        `${_hideSourceMaps_} to ${_false_}. (In ${_sentryNextjs_} version 8.0.0 and beyond, this option will default ` +
        `to ${_true_}.) See https://webpack.js.org/configuration/devtool/ and ` +
        'https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#use-hidden-source-map for more ' +
        'information.\n',
    );
  }

  // TODO (v8): Remove the check above in favor of the one below

  //   const infoPrefix = `${chalk.cyan('info')}  -`;
  //
  //   if (isServer && userSentryOptions.hideSourceMaps === true) {
  //     // eslint-disable-next-line no-console
  //     console.log(
  //       `\n${infoPrefix} Starting in ${_sentryNextjs_} version 8.0.0, ${_hideSourceMaps_} defaults to ${_true_}, and ` +
  //         `thus can be removed from the ${_sentry_} options in ${_nextConfigJS_}. See ` +
  //         'https://webpack.js.org/configuration/devtool/ and ' +
  //         'https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#use-hidden-source-map for more ' +
  //         'information.\n',
  //     );
  //   }
}

/**
 * Ensure that `newConfig.module.rules` exists. Modifies the given config in place but also returns it in order to
 * change its type.
 *
 * @param newConfig A webpack config object which may or may not contain `module` and `module.rules`
 * @returns The same object, with an empty `module.rules` array added if necessary
 */
function setUpModuleRules(newConfig: WebpackConfigObject): WebpackConfigObjectWithModuleRules {
  newConfig.module = {
    ...newConfig.module,
    rules: [...(newConfig.module?.rules || [])],
  };
  // Surprising that we have to assert the type here, since we've demonstrably guaranteed the existence of
  // `newConfig.module.rules` just above, but ¯\_(ツ)_/¯
  return newConfig as WebpackConfigObjectWithModuleRules;
}

/**
 * Adds loaders to inject values on the global object based on user configuration.
 */
function addValueInjectionLoader(
  newConfig: WebpackConfigObjectWithModuleRules,
  userNextConfig: NextConfigObject,
  userSentryOptions: UserSentryOptions,
  buildContext: BuildContext,
): void {
  const assetPrefix = userNextConfig.assetPrefix || userNextConfig.basePath || '';

  const isomorphicValues = {
    // `rewritesTunnel` set by the user in Next.js config
    __sentryRewritesTunnelPath__: userSentryOptions.tunnelRoute,
    SENTRY_RELEASE: { id: getSentryRelease(buildContext.buildId) },
  };

  const serverValues = {
    ...isomorphicValues,
    // Make sure that if we have a windows path, the backslashes are interpreted as such (rather than as escape
    // characters)
    __rewriteFramesDistDir__: userNextConfig.distDir?.replace(/\\/g, '\\\\') || '.next',
  };

  const clientValues = {
    ...isomorphicValues,
    // Get the path part of `assetPrefix`, minus any trailing slash. (We use a placeholder for the origin if
    // `assetPreix` doesn't include one. Since we only care about the path, it doesn't matter what it is.)
    __rewriteFramesAssetPrefixPath__: assetPrefix
      ? new URL(assetPrefix, 'http://dogs.are.great').pathname.replace(/\/$/, '')
      : '',
  };

  newConfig.module.rules.push(
    {
      test: /sentry\.server\.config\.(jsx?|tsx?)/,
      use: [
        {
          loader: path.resolve(__dirname, 'loaders/valueInjectionLoader.js'),
          options: {
            values: serverValues,
          },
        },
      ],
    },
    {
      test: /sentry\.client\.config\.(jsx?|tsx?)/,
      use: [
        {
          loader: path.resolve(__dirname, 'loaders/valueInjectionLoader.js'),
          options: {
            values: clientValues,
          },
        },
      ],
    },
  );
}
