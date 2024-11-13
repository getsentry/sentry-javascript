/* eslint-disable complexity */
/* eslint-disable max-lines */

import * as fs from 'fs';
import * as path from 'path';
import { getSentryRelease } from '@sentry/node';
import { arrayify, escapeStringForRegex, loadModule, logger } from '@sentry/utils';
import * as chalk from 'chalk';
import { sync as resolveSync } from 'resolve';

import type { VercelCronsConfig } from '../common/types';
// Note: If you need to import a type from Webpack, do it in `types.ts` and export it from there. Otherwise, our
// circular dependency check thinks this file is importing from itself. See https://github.com/pahen/madge/issues/306.
import type {
  BuildContext,
  EntryPropertyObject,
  IgnoreWarningsOption,
  NextConfigObject,
  SentryBuildOptions,
  WebpackConfigFunction,
  WebpackConfigObject,
  WebpackConfigObjectWithModuleRules,
  WebpackEntryProperty,
} from './types';
import { getWebpackPluginOptions } from './webpackPluginOptions';

// Next.js runs webpack 3 times, once for the client, the server, and for edge. Because we don't want to print certain
// warnings 3 times, we keep track of them here.
let showedMissingGlobalErrorWarningMsg = false;

/**
 * Construct the function which will be used as the nextjs config's `webpack` value.
 *
 * Sets:
 *   - `devtool`, to ensure high-quality sourcemaps are generated
 *   - `entry`, to include user's sentry config files (where `Sentry.init` is called) in the build
 *   - `plugins`, to add SentryWebpackPlugin
 *
 * @param userNextConfig The user's existing nextjs config, as passed to `withSentryConfig`
 * @param userSentryOptions The user's SentryWebpackPlugin config, as passed to `withSentryConfig`
 * @returns The function to set as the nextjs config's `webpack` value
 */
export function constructWebpackConfigFunction(
  userNextConfig: NextConfigObject = {},
  userSentryOptions: SentryBuildOptions = {},
): WebpackConfigFunction {
  // Will be called by nextjs and passed its default webpack configuration and context data about the build (whether
  // we're building server or client, whether we're in dev, what version of webpack we're using, etc). Note that
  // `incomingConfig` and `buildContext` are referred to as `config` and `options` in the nextjs docs.
  return function newWebpackFunction(
    incomingConfig: WebpackConfigObject,
    buildContext: BuildContext,
  ): WebpackConfigObject {
    const { isServer, dev: isDev, dir: projectDir } = buildContext;
    const runtime = isServer ? (buildContext.nextRuntime === 'edge' ? 'edge' : 'server') : 'client';

    if (runtime !== 'client') {
      warnAboutDeprecatedConfigFiles(projectDir, runtime);
    }

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

    addOtelWarningIgnoreRule(newConfig);

    let pagesDirPath: string | undefined;
    const maybePagesDirPath = path.join(projectDir, 'pages');
    const maybeSrcPagesDirPath = path.join(projectDir, 'src', 'pages');
    if (fs.existsSync(maybePagesDirPath) && fs.lstatSync(maybePagesDirPath).isDirectory()) {
      pagesDirPath = maybePagesDirPath;
    } else if (fs.existsSync(maybeSrcPagesDirPath) && fs.lstatSync(maybeSrcPagesDirPath).isDirectory()) {
      pagesDirPath = maybeSrcPagesDirPath;
    }

    let appDirPath: string | undefined;
    const maybeAppDirPath = path.join(projectDir, 'app');
    const maybeSrcAppDirPath = path.join(projectDir, 'src', 'app');
    if (fs.existsSync(maybeAppDirPath) && fs.lstatSync(maybeAppDirPath).isDirectory()) {
      appDirPath = maybeAppDirPath;
    } else if (fs.existsSync(maybeSrcAppDirPath) && fs.lstatSync(maybeSrcAppDirPath).isDirectory()) {
      appDirPath = maybeSrcAppDirPath;
    }

    const apiRoutesPath = pagesDirPath ? path.join(pagesDirPath, 'api') : undefined;

    const middlewareLocationFolder = pagesDirPath
      ? path.join(pagesDirPath, '..')
      : appDirPath
        ? path.join(appDirPath, '..')
        : projectDir;

    // Default page extensions per https://github.com/vercel/next.js/blob/f1dbc9260d48c7995f6c52f8fbcc65f08e627992/packages/next/server/config-shared.ts#L161
    const pageExtensions = userNextConfig.pageExtensions || ['tsx', 'ts', 'jsx', 'js'];
    const dotPrefixedPageExtensions = pageExtensions.map(ext => `.${ext}`);
    const pageExtensionRegex = pageExtensions.map(escapeStringForRegex).join('|');

    const staticWrappingLoaderOptions = {
      appDir: appDirPath,
      pagesDir: pagesDirPath,
      pageExtensionRegex,
      excludeServerRoutes: userSentryOptions.excludeServerRoutes,
      nextjsRequestAsyncStorageModulePath: getRequestAsyncStorageModuleLocation(
        projectDir,
        rawNewConfig.resolve?.modules,
      ),
    };

    const normalizeLoaderResourcePath = (resourcePath: string): string => {
      // `resourcePath` may be an absolute path or a path relative to the context of the webpack config
      let absoluteResourcePath: string;
      if (path.isAbsolute(resourcePath)) {
        absoluteResourcePath = resourcePath;
      } else {
        absoluteResourcePath = path.join(projectDir, resourcePath);
      }

      return path.normalize(absoluteResourcePath);
    };

    const isPageResource = (resourcePath: string): boolean => {
      const normalizedAbsoluteResourcePath = normalizeLoaderResourcePath(resourcePath);
      return (
        pagesDirPath !== undefined &&
        normalizedAbsoluteResourcePath.startsWith(pagesDirPath + path.sep) &&
        !normalizedAbsoluteResourcePath.startsWith(apiRoutesPath + path.sep) &&
        dotPrefixedPageExtensions.some(ext => normalizedAbsoluteResourcePath.endsWith(ext))
      );
    };

    const isApiRouteResource = (resourcePath: string): boolean => {
      const normalizedAbsoluteResourcePath = normalizeLoaderResourcePath(resourcePath);
      return (
        normalizedAbsoluteResourcePath.startsWith(apiRoutesPath + path.sep) &&
        dotPrefixedPageExtensions.some(ext => normalizedAbsoluteResourcePath.endsWith(ext))
      );
    };

    const possibleMiddlewareLocations = pageExtensions.map(middlewareFileEnding => {
      return path.join(middlewareLocationFolder, `middleware.${middlewareFileEnding}`);
    });
    const isMiddlewareResource = (resourcePath: string): boolean => {
      const normalizedAbsoluteResourcePath = normalizeLoaderResourcePath(resourcePath);
      return possibleMiddlewareLocations.includes(normalizedAbsoluteResourcePath);
    };

    const isServerComponentResource = (resourcePath: string): boolean => {
      const normalizedAbsoluteResourcePath = normalizeLoaderResourcePath(resourcePath);

      // ".js, .jsx, or .tsx file extensions can be used for Pages"
      // https://beta.nextjs.org/docs/routing/pages-and-layouts#pages:~:text=.js%2C%20.jsx%2C%20or%20.tsx%20file%20extensions%20can%20be%20used%20for%20Pages.
      return (
        appDirPath !== undefined &&
        normalizedAbsoluteResourcePath.startsWith(appDirPath + path.sep) &&
        !!normalizedAbsoluteResourcePath.match(
          // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor
          new RegExp(`[\\\\/](page|layout|loading|head|not-found)\\.(${pageExtensionRegex})$`),
        )
      );
    };

    const isRouteHandlerResource = (resourcePath: string): boolean => {
      const normalizedAbsoluteResourcePath = normalizeLoaderResourcePath(resourcePath);
      return (
        appDirPath !== undefined &&
        normalizedAbsoluteResourcePath.startsWith(appDirPath + path.sep) &&
        !!normalizedAbsoluteResourcePath.match(
          // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor
          new RegExp(`[\\\\/]route\\.(${pageExtensionRegex})$`),
        )
      );
    };

    if (isServer && userSentryOptions.autoInstrumentServerFunctions !== false) {
      // It is very important that we insert our loaders at the beginning of the array because we expect any sort of transformations/transpilations (e.g. TS -> JS) to already have happened.

      // Wrap pages
      newConfig.module.rules.unshift({
        test: isPageResource,
        use: [
          {
            loader: path.resolve(__dirname, 'loaders', 'wrappingLoader.js'),
            options: {
              ...staticWrappingLoaderOptions,
              wrappingTargetKind: 'page',
            },
          },
        ],
      });

      let vercelCronsConfig: VercelCronsConfig = undefined;
      try {
        if (process.env.VERCEL && userSentryOptions.automaticVercelMonitors) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          vercelCronsConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')).crons;
          if (vercelCronsConfig) {
            logger.info(
              `${chalk.cyan(
                'info',
              )} - Creating Sentry cron monitors for your Vercel Cron Jobs. You can disable this feature by setting the ${chalk.bold.cyan(
                'automaticVercelMonitors',
              )} option to false in you Next.js config.`,
            );
          }
        }
      } catch (e) {
        if ((e as { code: string }).code === 'ENOENT') {
          // noop if file does not exist
        } else {
          // log but noop
          logger.error(
            `${chalk.red(
              'error',
            )} - Sentry failed to read vercel.json for automatic cron job monitoring instrumentation`,
            e,
          );
        }
      }

      // Wrap api routes
      newConfig.module.rules.unshift({
        test: isApiRouteResource,
        use: [
          {
            loader: path.resolve(__dirname, 'loaders', 'wrappingLoader.js'),
            options: {
              ...staticWrappingLoaderOptions,
              vercelCronsConfig,
              wrappingTargetKind: 'api-route',
            },
          },
        ],
      });

      // Wrap middleware
      if (userSentryOptions.autoInstrumentMiddleware ?? true) {
        newConfig.module.rules.unshift({
          test: isMiddlewareResource,
          use: [
            {
              loader: path.resolve(__dirname, 'loaders', 'wrappingLoader.js'),
              options: {
                ...staticWrappingLoaderOptions,
                wrappingTargetKind: 'middleware',
              },
            },
          ],
        });
      }
    }

    if (isServer && userSentryOptions.autoInstrumentAppDirectory !== false) {
      // Wrap server components
      newConfig.module.rules.unshift({
        test: isServerComponentResource,
        use: [
          {
            loader: path.resolve(__dirname, 'loaders', 'wrappingLoader.js'),
            options: {
              ...staticWrappingLoaderOptions,
              wrappingTargetKind: 'server-component',
            },
          },
        ],
      });

      // Wrap route handlers
      newConfig.module.rules.unshift({
        test: isRouteHandlerResource,
        use: [
          {
            loader: path.resolve(__dirname, 'loaders', 'wrappingLoader.js'),
            options: {
              ...staticWrappingLoaderOptions,
              wrappingTargetKind: 'route-handler',
            },
          },
        ],
      });
    }

    if (appDirPath) {
      const hasGlobalErrorFile = pageExtensions
        .map(extension => `global-error.${extension}`)
        .some(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          globalErrorFile => fs.existsSync(path.join(appDirPath!, globalErrorFile)),
        );

      if (
        !hasGlobalErrorFile &&
        !showedMissingGlobalErrorWarningMsg &&
        !process.env.SENTRY_SUPPRESS_GLOBAL_ERROR_HANDLER_FILE_WARNING
      ) {
        // eslint-disable-next-line no-console
        console.log(
          `${chalk.yellow(
            'warn',
          )}  - It seems like you don't have a global error handler set up. It is recommended that you add a ${chalk.cyan(
            'global-error.js',
          )} file with Sentry instrumentation so that React rendering errors are reported to Sentry. Read more: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router (you can suppress this warning by setting SENTRY_SUPPRESS_GLOBAL_ERROR_HANDLER_FILE_WARNING=1 as environment variable)`,
        );
        showedMissingGlobalErrorWarningMsg = true;
      }
    }

    if (!isServer) {
      // Tell webpack to inject the client config files (containing the client-side `Sentry.init()` call) into the appropriate output
      // bundles. Store a separate reference to the original `entry` value to avoid an infinite loop. (If we don't do
      // this, we'll have a statement of the form `x.y = () => f(x.y)`, where one of the things `f` does is call `x.y`.
      // Since we're setting `x.y` to be a callback (which, by definition, won't run until some time later), by the time
      // the function runs (causing `f` to run, causing `x.y` to run), `x.y` will point to the callback itself, rather
      // than its original value. So calling it will call the callback which will call `f` which will call `x.y` which
      // will call the callback which will call `f` which will call `x.y`... and on and on. Theoretically this could also
      // be fixed by using `bind`, but this is way simpler.)
      const origEntryProperty = newConfig.entry;
      newConfig.entry = async () => addSentryToClientEntryProperty(origEntryProperty, buildContext);
    }

    // We don't want to do any webpack plugin stuff OR any source maps stuff in dev mode.
    // Symbolication for dev-mode errors is done elsewhere.
    if (!isDev) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { sentryWebpackPlugin } = loadModule<{ sentryWebpackPlugin: any }>('@sentry/webpack-plugin') ?? {};

      if (sentryWebpackPlugin) {
        if (!userSentryOptions.sourcemaps?.disable) {
          // `hidden-source-map` produces the same sourcemaps as `source-map`, but doesn't include the `sourceMappingURL`
          // comment at the bottom. For folks who aren't publicly hosting their sourcemaps, this is helpful because then
          // the browser won't look for them and throw errors into the console when it can't find them. Because this is a
          // front-end-only problem, and because `sentry-cli` handles sourcemaps more reliably with the comment than
          // without, the option to use `hidden-source-map` only applies to the client-side build.
          newConfig.devtool =
            isServer || userNextConfig.productionBrowserSourceMaps ? 'source-map' : 'hidden-source-map';
        }

        newConfig.plugins = newConfig.plugins || [];
        const sentryWebpackPluginInstance = sentryWebpackPlugin(
          getWebpackPluginOptions(buildContext, userSentryOptions),
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        sentryWebpackPluginInstance._name = 'sentry-webpack-plugin'; // For tests and debugging. Serves no other purpose.
        newConfig.plugins.push(sentryWebpackPluginInstance);
      }
    }

    if (userSentryOptions.disableLogger) {
      newConfig.plugins = newConfig.plugins || [];
      newConfig.plugins.push(
        new buildContext.webpack.DefinePlugin({
          __SENTRY_DEBUG__: false,
        }),
      );
    }

    return newConfig;
  };
}

/**
 * Modify the webpack `entry` property so that the code in `sentry.client.config.js` is
 * included in the the necessary bundles.
 *
 * @param currentEntryProperty The value of the property before Sentry code has been injected
 * @param buildContext Object passed by nextjs containing metadata about the build
 * @returns The value which the new `entry` property (which will be a function) will return (TODO: this should return
 * the function, rather than the function's return value)
 */
async function addSentryToClientEntryProperty(
  currentEntryProperty: WebpackEntryProperty,
  buildContext: BuildContext,
): Promise<EntryPropertyObject> {
  // The `entry` entry in a webpack config can be a string, array of strings, object, or function. By default, nextjs
  // sets it to an async function which returns the promise of an object of string arrays. Because we don't know whether
  // someone else has come along before us and changed that, we need to check a few things along the way. The one thing
  // we know is that it won't have gotten *simpler* in form, so we only need to worry about the object and function
  // options. See https://webpack.js.org/configuration/entry-context/#entry.

  const { dir: projectDir, dev: isDevMode } = buildContext;

  const newEntryProperty =
    typeof currentEntryProperty === 'function' ? await currentEntryProperty() : { ...currentEntryProperty };

  const clientSentryConfigFileName = getClientSentryConfigFile(projectDir);

  // we need to turn the filename into a path so webpack can find it
  const filesToInject = clientSentryConfigFileName ? [`./${clientSentryConfigFileName}`] : [];

  // inject into all entry points which might contain user's code
  for (const entryPointName in newEntryProperty) {
    if (
      entryPointName === 'pages/_app' ||
      // entrypoint for `/app` pages
      entryPointName === 'main-app'
    ) {
      addFilesToWebpackEntryPoint(newEntryProperty, entryPointName, filesToInject, isDevMode);
    }
  }

  return newEntryProperty;
}

/**
 * Searches for old `sentry.(server|edge).config.ts` files and Next.js instrumentation hooks and warns if there are "old"
 * config files and no signs of them inside the instrumentation hook.
 *
 * @param projectDir The root directory of the project, where config files would be located
 * @param platform Either "server" or "edge", so that we know which file to look for
 */
function warnAboutDeprecatedConfigFiles(projectDir: string, platform: 'server' | 'edge'): void {
  const hasInstrumentationHookWithIndicationsOfSentry = [
    ['src', 'instrumentation.ts'],
    ['src', 'instrumentation.js'],
    ['instrumentation.ts'],
    ['instrumentation.js'],
  ].some(potentialInstrumentationHookPathSegments => {
    try {
      const instrumentationHookContent = fs.readFileSync(
        path.resolve(projectDir, ...potentialInstrumentationHookPathSegments),
        { encoding: 'utf-8' },
      );

      return (
        instrumentationHookContent.includes('@sentry/') ||
        instrumentationHookContent.match(/sentry\.(server|edge)\.config(\.(ts|js))?/)
      );
    } catch (e) {
      return false;
    }
  });

  if (hasInstrumentationHookWithIndicationsOfSentry) {
    return;
  }

  for (const filename of [`sentry.${platform}.config.ts`, `sentry.${platform}.config.js`]) {
    if (fs.existsSync(path.resolve(projectDir, filename))) {
      // eslint-disable-next-line no-console
      console.warn(
        `[@sentry/nextjs] It appears you've configured a \`${filename}\` file. Please ensure to put this file's content into the \`register()\` function of a Next.js instrumentation hook instead. To ensure correct functionality of the SDK, \`Sentry.init\` must be called inside \`instrumentation.ts\`. Learn more about setting up an instrumentation hook in Next.js: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation. You can safely delete the \`${filename}\` file afterward.`,
      );
    }
  }
}

/**
 * Searches for a `sentry.client.config.ts|js` file and returns its file name if it finds one. (ts being prioritized)
 *
 * @param projectDir The root directory of the project, where config files would be located
 */
export function getClientSentryConfigFile(projectDir: string): string | void {
  const possibilities = ['sentry.client.config.ts', 'sentry.client.config.js'];

  for (const filename of possibilities) {
    if (fs.existsSync(path.resolve(projectDir, filename))) {
      return filename;
    }
  }
}

/**
 * Add files to a specific element of the given `entry` webpack config property.
 *
 * @param entryProperty The existing `entry` config object
 * @param entryPointName The key where the file should be injected
 * @param filesToInsert An array of paths to the injected files
 */
function addFilesToWebpackEntryPoint(
  entryProperty: EntryPropertyObject,
  entryPointName: string,
  filesToInsert: string[],
  isDevMode: boolean,
): void {
  // BIG FAT NOTE: Order of insertion seems to matter here. If we insert the new files before the `currentEntrypoint`s,
  // the Next.js dev server breaks. Because we generally still want the SDK to be initialized as early as possible we
  // still keep it at the start of the entrypoints if we are not in dev mode.

  // can be a string, array of strings, or object whose `import` property is one of those two
  const currentEntryPoint = entryProperty[entryPointName];
  let newEntryPoint = currentEntryPoint;

  if (typeof currentEntryPoint === 'string' || Array.isArray(currentEntryPoint)) {
    newEntryPoint = arrayify(currentEntryPoint);
    if (newEntryPoint.some(entry => filesToInsert.includes(entry))) {
      return;
    }

    if (isDevMode) {
      // Inserting at beginning breaks dev mode so we insert at the end
      newEntryPoint.push(...filesToInsert);
    } else {
      // In other modes we insert at the beginning so that the SDK initializes as early as possible
      newEntryPoint.unshift(...filesToInsert);
    }
  }
  // descriptor object (webpack 5+)
  else if (typeof currentEntryPoint === 'object' && 'import' in currentEntryPoint) {
    const currentImportValue = currentEntryPoint.import;
    const newImportValue = arrayify(currentImportValue);
    if (newImportValue.some(entry => filesToInsert.includes(entry))) {
      return;
    }

    if (isDevMode) {
      // Inserting at beginning breaks dev mode so we insert at the end
      newImportValue.push(...filesToInsert);
    } else {
      // In other modes we insert at the beginning so that the SDK initializes as early as possible
      newImportValue.unshift(...filesToInsert);
    }

    newEntryPoint = {
      ...currentEntryPoint,
      import: newImportValue,
    };
  }
  // malformed entry point (use `console.error` rather than `logger.error` because it will always be printed, regardless
  // of SDK settings)
  else {
    // eslint-disable-next-line no-console
    console.error(
      'Sentry Logger [Error]:',
      `Could not inject SDK initialization code into entry point ${entryPointName}, as its current value is not in a recognized format.\n`,
      'Expected: string | Array<string> | { [key:string]: any, import: string | Array<string> }\n',
      `Got: ${currentEntryPoint}`,
    );
  }

  if (newEntryPoint) {
    entryProperty[entryPointName] = newEntryPoint;
  }
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
// TODO(v9): Remove this loader and replace it with a nextConfig.env (https://web.archive.org/web/20240917153554/https://nextjs.org/docs/app/api-reference/next-config-js/env) or define based (https://github.com/vercel/next.js/discussions/71476) approach.
// In order to remove this loader though we need to make sure the minimum supported Next.js version includes this PR (https://github.com/vercel/next.js/pull/61194), otherwise the nextConfig.env based approach will not work, as our SDK code is not processed by Next.js.
function addValueInjectionLoader(
  newConfig: WebpackConfigObjectWithModuleRules,
  userNextConfig: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
  buildContext: BuildContext,
): void {
  const assetPrefix = userNextConfig.assetPrefix || userNextConfig.basePath || '';

  const isomorphicValues = {
    // `rewritesTunnel` set by the user in Next.js config
    _sentryRewritesTunnelPath:
      userSentryOptions.tunnelRoute !== undefined && userNextConfig.output !== 'export'
        ? `${userNextConfig.basePath ?? ''}${userSentryOptions.tunnelRoute}`
        : undefined,

    // The webpack plugin's release injection breaks the `app` directory so we inject the release manually here instead.
    // Having a release defined in dev-mode spams releases in Sentry so we only set one in non-dev mode
    SENTRY_RELEASE: buildContext.dev
      ? undefined
      : { id: userSentryOptions.release?.name ?? getSentryRelease(buildContext.buildId) },
    _sentryBasePath: buildContext.dev ? userNextConfig.basePath : undefined,
  };

  const serverValues = {
    ...isomorphicValues,
    // Make sure that if we have a windows path, the backslashes are interpreted as such (rather than as escape
    // characters)
    _sentryRewriteFramesDistDir: userNextConfig.distDir?.replace(/\\/g, '\\\\') || '.next',
  };

  const clientValues = {
    ...isomorphicValues,
    // Get the path part of `assetPrefix`, minus any trailing slash. (We use a placeholder for the origin if
    // `assetPrefix` doesn't include one. Since we only care about the path, it doesn't matter what it is.)
    _sentryRewriteFramesAssetPrefixPath: assetPrefix
      ? new URL(assetPrefix, 'http://dogs.are.great').pathname.replace(/\/$/, '')
      : '',
  };

  if (buildContext.isServer) {
    newConfig.module.rules.push({
      // TODO: Find a more bulletproof way of matching. For now this is fine and doesn't hurt anyone. It merely sets some globals.
      test: /(src[\\/])?instrumentation.(js|ts)/,
      use: [
        {
          loader: path.resolve(__dirname, 'loaders/valueInjectionLoader.js'),
          options: {
            values: serverValues,
          },
        },
      ],
    });
  } else {
    newConfig.module.rules.push({
      test: /sentry\.client\.config\.(jsx?|tsx?)/,
      use: [
        {
          loader: path.resolve(__dirname, 'loaders/valueInjectionLoader.js'),
          options: {
            values: clientValues,
          },
        },
      ],
    });
  }
}

function resolveNextPackageDirFromDirectory(basedir: string): string | undefined {
  try {
    return path.dirname(resolveSync('next/package.json', { basedir }));
  } catch {
    // Should not happen in theory
    return undefined;
  }
}

const POTENTIAL_REQUEST_ASYNC_STORAGE_LOCATIONS = [
  // Original location of RequestAsyncStorage
  // https://github.com/vercel/next.js/blob/46151dd68b417e7850146d00354f89930d10b43b/packages/next/src/client/components/request-async-storage.ts
  'next/dist/client/components/request-async-storage.js',
  // Introduced in Next.js 13.4.20
  // https://github.com/vercel/next.js/blob/e1bc270830f2fc2df3542d4ef4c61b916c802df3/packages/next/src/client/components/request-async-storage.external.ts
  'next/dist/client/components/request-async-storage.external.js',
  // Introduced in Next.js 15.0.0-canary.180
  // https://github.com/vercel/next.js/blob/541167b9b0fed6af9f36472e632863ffec41f18c/packages/next/src/server/app-render/work-unit-async-storage.external.ts
  'next/dist/server/app-render/work-unit-async-storage.external.js',
  // Introduced in Next.js 15.0.0-canary.182
  // https://github.com/vercel/next.js/blob/f35159e5e80138ca7373f57b47edcaae3bcf1728/packages/next/src/client/components/work-unit-async-storage.external.ts
  'next/dist/client/components/work-unit-async-storage.external.js',
];

function getRequestAsyncStorageModuleLocation(
  webpackContextDir: string,
  webpackResolvableModuleLocations: string[] | undefined,
): string | undefined {
  if (webpackResolvableModuleLocations === undefined) {
    return undefined;
  }

  const absoluteWebpackResolvableModuleLocations = webpackResolvableModuleLocations.map(loc =>
    path.resolve(webpackContextDir, loc),
  );

  for (const webpackResolvableLocation of absoluteWebpackResolvableModuleLocations) {
    const nextPackageDir = resolveNextPackageDirFromDirectory(webpackResolvableLocation);
    if (nextPackageDir) {
      const asyncLocalStorageLocation = POTENTIAL_REQUEST_ASYNC_STORAGE_LOCATIONS.find(loc =>
        fs.existsSync(path.join(nextPackageDir, '..', loc)),
      );
      if (asyncLocalStorageLocation) {
        return asyncLocalStorageLocation;
      }
    }
  }

  return undefined;
}

function addOtelWarningIgnoreRule(newConfig: WebpackConfigObjectWithModuleRules): void {
  const ignoreRules = [
    // Inspired by @matmannion: https://github.com/getsentry/sentry-javascript/issues/12077#issuecomment-2180307072
    (warning, compilation) => {
      // This is wrapped in try-catch because we are vendoring types for this hook and we can't be 100% sure that we are accessing API that is there
      try {
        if (!warning.module) {
          return false;
        }

        const isDependencyThatMayRaiseCriticalDependencyMessage =
          /@opentelemetry\/instrumentation/.test(warning.module.readableIdentifier(compilation.requestShortener)) ||
          /@prisma\/instrumentation/.test(warning.module.readableIdentifier(compilation.requestShortener));
        const isCriticalDependencyMessage = /Critical dependency/.test(warning.message);

        return isDependencyThatMayRaiseCriticalDependencyMessage && isCriticalDependencyMessage;
      } catch {
        return false;
      }
    },
    // We provide these objects in addition to the hook above to provide redundancy in case the hook fails.
    { module: /@opentelemetry\/instrumentation/, message: /Critical dependency/ },
    { module: /@prisma\/instrumentation/, message: /Critical dependency/ },
  ] satisfies IgnoreWarningsOption;

  if (newConfig.ignoreWarnings === undefined) {
    newConfig.ignoreWarnings = ignoreRules;
  } else if (Array.isArray(newConfig.ignoreWarnings)) {
    newConfig.ignoreWarnings.push(...ignoreRules);
  }
}
