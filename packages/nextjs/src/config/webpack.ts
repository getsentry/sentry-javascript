/* eslint-disable complexity */
/* eslint-disable max-lines */

import { debug, escapeStringForRegex, loadModule, parseSemver } from '@sentry/core';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import type { VercelCronsConfig } from '../common/types';
import { getBuildPluginOptions, normalizePathForGlob } from './getBuildPluginOptions';
import type { RouteManifest } from './manifest/types';
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
import { getNextjsVersion } from './util';

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
export function constructWebpackConfigFunction({
  userNextConfig = {},
  userSentryOptions = {},
  releaseName,
  routeManifest,
  nextJsVersion,
  useRunAfterProductionCompileHook,
}: {
  userNextConfig: NextConfigObject;
  userSentryOptions: SentryBuildOptions;
  releaseName: string | undefined;
  routeManifest: RouteManifest | undefined;
  nextJsVersion: string | undefined;
  useRunAfterProductionCompileHook: boolean | undefined;
}): WebpackConfigFunction {
  // Will be called by nextjs and passed its default webpack configuration and context data about the build (whether
  // we're building server or client, whether we're in dev, what version of webpack we're using, etc). Note that
  // `incomingConfig` and `buildContext` are referred to as `config` and `options` in the nextjs docs.
  return function newWebpackFunction(
    incomingConfig: WebpackConfigObject,
    buildContext: BuildContext,
  ): WebpackConfigObject {
    const { isServer, dev: isDev, dir: projectDir } = buildContext;
    const runtime = isServer ? (buildContext.nextRuntime === 'edge' ? 'edge' : 'server') : 'client';
    // Default page extensions per https://github.com/vercel/next.js/blob/f1dbc9260d48c7995f6c52f8fbcc65f08e627992/packages/next/server/config-shared.ts#L161
    const pageExtensions = userNextConfig.pageExtensions || ['tsx', 'ts', 'jsx', 'js'];
    const dotPrefixedPageExtensions = pageExtensions.map(ext => `.${ext}`);
    const pageExtensionRegex = pageExtensions.map(escapeStringForRegex).join('|');
    const nextVersion = nextJsVersion || getNextjsVersion();
    const { major } = parseSemver(nextVersion || '');

    // We add `.ts` and `.js` back in because `pageExtensions` might not be relevant to the instrumentation file
    // e.g. user's setting `.mdx`. In that case we still want to default look up
    // `instrumentation.ts` and `instrumentation.js`
    const instrumentationFile = getInstrumentationFile(projectDir, dotPrefixedPageExtensions.concat(['.ts', '.js']));

    if (runtime !== 'client') {
      warnAboutDeprecatedConfigFiles(projectDir, instrumentationFile, runtime);
    }
    if (runtime === 'server') {
      // was added in v15 (https://github.com/vercel/next.js/pull/67539)
      if (major && major >= 15) {
        warnAboutMissingOnRequestErrorHandler(instrumentationFile);
      }
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
    addValueInjectionLoader({
      newConfig,
      userNextConfig,
      userSentryOptions,
      buildContext,
      releaseName,
      routeManifest,
      nextJsVersion,
    });

    addOtelWarningIgnoreRule(newConfig);

    // Add edge runtime polyfills when building for edge in dev mode
    if (major && major === 13 && runtime === 'edge' && isDev) {
      addEdgeRuntimePolyfills(newConfig, buildContext);
    }

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

    const staticWrappingLoaderOptions = {
      appDir: appDirPath,
      pagesDir: pagesDirPath,
      pageExtensionRegex,
      excludeServerRoutes: userSentryOptions.webpack?.excludeServerRoutes,
      nextjsRequestAsyncStorageModulePath: getRequestAsyncStorageModuleLocation(
        projectDir,
        rawNewConfig.resolve?.modules,
      ),
      isDev,
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

    const possibleMiddlewareLocations = pageExtensions.flatMap(middlewareFileEnding => {
      return [
        path.join(middlewareLocationFolder, `middleware.${middlewareFileEnding}`),
        path.join(middlewareLocationFolder, `proxy.${middlewareFileEnding}`),
      ];
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

    if (isServer && userSentryOptions.webpack?.autoInstrumentServerFunctions !== false) {
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
        if (process.env.VERCEL && userSentryOptions.webpack?.automaticVercelMonitors) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          vercelCronsConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')).crons;
          if (vercelCronsConfig) {
            debug.log(
              "[@sentry/nextjs] Creating Sentry cron monitors for your Vercel Cron Jobs. You can disable this feature by setting the 'automaticVercelMonitors' option to false in you Next.js config.",
            );
          }
        }
      } catch (e) {
        if ((e as { code: string }).code === 'ENOENT') {
          // noop if file does not exist
        } else {
          // log but noop
          debug.error(
            '[@sentry/nextjs] Failed to read vercel.json for automatic cron job monitoring instrumentation',
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
      const canWrapStandaloneMiddleware = userNextConfig.output !== 'standalone' || !major || major < 16;
      if ((userSentryOptions.webpack?.autoInstrumentMiddleware ?? true) && canWrapStandaloneMiddleware) {
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

    if (isServer && userSentryOptions.webpack?.autoInstrumentAppDirectory !== false) {
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
        .some(globalErrorFile => fs.existsSync(path.join(appDirPath, globalErrorFile)));

      if (
        !hasGlobalErrorFile &&
        !showedMissingGlobalErrorWarningMsg &&
        !process.env.SENTRY_SUPPRESS_GLOBAL_ERROR_HANDLER_FILE_WARNING
      ) {
        // eslint-disable-next-line no-console
        console.log(
          "[@sentry/nextjs] It seems like you don't have a global error handler set up. It is recommended that you add a 'global-error.js' file with Sentry instrumentation so that React rendering errors are reported to Sentry. Read more: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router (you can suppress this warning by setting SENTRY_SUPPRESS_GLOBAL_ERROR_HANDLER_FILE_WARNING=1 as environment variable)",
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

      const clientSentryConfigFileName = getClientSentryConfigFile(projectDir);
      if (clientSentryConfigFileName) {
        // eslint-disable-next-line no-console
        console.warn(
          `[@sentry/nextjs] DEPRECATION WARNING: It is recommended renaming your \`${clientSentryConfigFileName}\` file, or moving its content to \`instrumentation-client.ts\`. When using Turbopack \`${clientSentryConfigFileName}\` will no longer work. Read more about the \`instrumentation-client.ts\` file: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client`,
        );
      }
    }

    const isStaticExport = userNextConfig?.output === 'export';

    // We don't want to do any webpack plugin stuff OR any source maps stuff in dev mode or for the server on static-only builds.
    // Symbolication for dev-mode errors is done elsewhere.
    if (!(isDev || (isStaticExport && isServer))) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { sentryWebpackPlugin } = loadModule<{ sentryWebpackPlugin: any }>('@sentry/webpack-plugin', module) ?? {};

      if (sentryWebpackPlugin) {
        if (!userSentryOptions.sourcemaps?.disable) {
          // Source maps can be configured in 3 ways:
          // 1. (next config): productionBrowserSourceMaps
          // 2. (next config): experimental.serverSourceMaps
          // 3. custom webpack configuration
          //
          // We only update this if no explicit value is set
          // (Next.js defaults to `false`: https://github.com/vercel/next.js/blob/5f4f96c133bd6b10954812cc2fef6af085b82aa5/packages/next/src/build/webpack/config/blocks/base.ts#L61)
          if (!newConfig.devtool) {
            debug.log(`[@sentry/nextjs] Automatically enabling source map generation for ${runtime} build.`);
            // `hidden-source-map` produces the same sourcemaps as `source-map`, but doesn't include the `sourceMappingURL`
            // comment at the bottom. For folks who aren't publicly hosting their sourcemaps, this is helpful because then
            // the browser won't look for them and throw errors into the console when it can't find them. Because this is a
            // front-end-only problem, and because `sentry-cli` handles sourcemaps more reliably with the comment than
            // without, the option to use `hidden-source-map` only applies to the client-side build.
            if (isServer) {
              newConfig.devtool = 'source-map';
            } else {
              newConfig.devtool = 'hidden-source-map';
            }
          }

          // enable source map deletion if not explicitly disabled
          if (!isServer && userSentryOptions.sourcemaps?.deleteSourcemapsAfterUpload === undefined) {
            debug.warn(
              '[@sentry/nextjs] Source maps will be automatically deleted after being uploaded to Sentry. If you want to keep the source maps, set the `sourcemaps.deleteSourcemapsAfterUpload` option to false in `withSentryConfig()`. If you do not want to generate and upload sourcemaps at all, set the `sourcemaps.disable` option to true.',
            );
            userSentryOptions.sourcemaps = {
              ...userSentryOptions.sourcemaps,
              deleteSourcemapsAfterUpload: true,
            };
          }
        }

        newConfig.plugins = newConfig.plugins || [];
        const { config: userNextConfig, dir, nextRuntime } = buildContext;
        const buildTool = isServer ? (nextRuntime === 'edge' ? 'webpack-edge' : 'webpack-nodejs') : 'webpack-client';
        const projectDir = normalizePathForGlob(dir);
        const distDir = normalizePathForGlob((userNextConfig as NextConfigObject).distDir ?? '.next');
        const distDirAbsPath = path.posix.join(projectDir, distDir);

        const sentryWebpackPluginInstance = sentryWebpackPlugin(
          getBuildPluginOptions({
            sentryBuildOptions: userSentryOptions,
            releaseName,
            distDirAbsPath,
            buildTool,
            useRunAfterProductionCompileHook,
          }),
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        sentryWebpackPluginInstance._name = 'sentry-webpack-plugin'; // For tests and debugging. Serves no other purpose.
        newConfig.plugins.push(sentryWebpackPluginInstance);
      }
    }

    if (userSentryOptions.webpack?.treeshake) {
      setupTreeshakingFromConfig(userSentryOptions, newConfig, buildContext);
    }

    // We inject a map of dependencies that the nextjs app has, as we cannot reliably extract them at runtime, sadly
    newConfig.plugins = newConfig.plugins || [];
    newConfig.plugins.push(
      new buildContext.webpack.DefinePlugin({
        __SENTRY_SERVER_MODULES__: JSON.stringify(_getModules(projectDir)),
      }),
    );

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
  const instrumentationClientFileName = getInstrumentationClientFile(projectDir);

  const filesToInject = [];
  if (clientSentryConfigFileName) {
    // we need to turn the filename into a path so webpack can find it
    filesToInject.push(`./${clientSentryConfigFileName}`);
  }
  if (instrumentationClientFileName) {
    // we need to turn the filename into a path so webpack can find it
    filesToInject.push(`./${instrumentationClientFileName}`);
  }

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
 * Gets the content of the user's instrumentation file
 */
function getInstrumentationFile(projectDir: string, dotPrefixedExtensions: string[]): string | null {
  const paths = dotPrefixedExtensions.flatMap(extension => [
    ['src', `instrumentation${extension}`],
    [`instrumentation${extension}`],
  ]);

  for (const pathSegments of paths) {
    try {
      return fs.readFileSync(path.resolve(projectDir, ...pathSegments), { encoding: 'utf-8' });
    } catch {
      // no-op
    }
  }

  return null;
}

/**
 * Make sure the instrumentation file has a `onRequestError` Handler
 */
function warnAboutMissingOnRequestErrorHandler(instrumentationFile: string | null): void {
  if (!instrumentationFile) {
    if (!process.env.SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING) {
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/nextjs] Could not find a Next.js instrumentation file. This indicates an incomplete configuration of the Sentry SDK. An instrumentation file is required for the Sentry SDK to be initialized on the server: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#create-initialization-config-files (you can suppress this warning by setting SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING=1 as environment variable)',
      );
    }
    return;
  }

  if (!instrumentationFile.includes('onRequestError')) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] Could not find `onRequestError` hook in instrumentation file. This indicates outdated configuration of the Sentry SDK. Use `Sentry.captureRequestError` to instrument the `onRequestError` hook: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errors-from-nested-react-server-components',
    );
  }
}

/**
 * Searches for old `sentry.(server|edge).config.ts` files and Next.js instrumentation hooks and warns if there are "old"
 * config files and no signs of them inside the instrumentation hook.
 *
 * @param projectDir The root directory of the project, where config files would be located
 * @param platform Either "server" or "edge", so that we know which file to look for
 */
function warnAboutDeprecatedConfigFiles(
  projectDir: string,
  instrumentationFile: string | null,
  platform: 'server' | 'edge',
): void {
  const hasInstrumentationHookWithIndicationsOfSentry =
    instrumentationFile &&
    (instrumentationFile.includes('@sentry/') ||
      instrumentationFile.match(/sentry\.(server|edge)\.config(\.(ts|js))?/));

  if (hasInstrumentationHookWithIndicationsOfSentry) {
    return;
  }

  for (const filename of [`sentry.${platform}.config.ts`, `sentry.${platform}.config.js`]) {
    if (fs.existsSync(path.resolve(projectDir, filename))) {
      // eslint-disable-next-line no-console
      console.warn(
        `[@sentry/nextjs] It appears you've configured a \`${filename}\` file. Please ensure to put this file's content into the \`register()\` function of a Next.js instrumentation file instead. To ensure correct functionality of the SDK, \`Sentry.init\` must be called inside of an instrumentation file. Learn more about setting up an instrumentation file in Next.js: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation. You can safely delete the \`${filename}\` file afterward.`,
      );
    }
  }
}

/**
 * Searches for a `sentry.client.config.ts|js` file and returns its file name if it finds one. (ts being prioritized)
 *
 * @param projectDir The root directory of the project, where config files would be located
 */
function getClientSentryConfigFile(projectDir: string): string | void {
  const possibilities = ['sentry.client.config.ts', 'sentry.client.config.js'];

  for (const filename of possibilities) {
    if (fs.existsSync(path.resolve(projectDir, filename))) {
      return filename;
    }
  }
}

/**
 * Searches for a `instrumentation-client.ts|js` file and returns its file name if it finds one. (ts being prioritized)
 *
 * @param projectDir The root directory of the project, where config files would be located
 */
function getInstrumentationClientFile(projectDir: string): string | void {
  const possibilities = [
    ['src', 'instrumentation-client.js'],
    ['src', 'instrumentation-client.ts'],
    ['instrumentation-client.js'],
    ['instrumentation-client.ts'],
  ];

  for (const pathParts of possibilities) {
    if (fs.existsSync(path.resolve(projectDir, ...pathParts))) {
      return path.join(...pathParts);
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
    newEntryPoint = Array.isArray(currentEntryPoint) ? currentEntryPoint : [currentEntryPoint];
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
    const newImportValue = Array.isArray(currentImportValue) ? currentImportValue : [currentImportValue];
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
  // malformed entry point (use `console.error` rather than `debug.error` because it will always be printed, regardless
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
// TODO: Remove this loader and replace it with a nextConfig.env (https://web.archive.org/web/20240917153554/https://nextjs.org/docs/app/api-reference/next-config-js/env) or define based (https://github.com/vercel/next.js/discussions/71476) approach.
// In order to remove this loader though we need to make sure the minimum supported Next.js version includes this PR (https://github.com/vercel/next.js/pull/61194), otherwise the nextConfig.env based approach will not work, as our SDK code is not processed by Next.js.
function addValueInjectionLoader({
  newConfig,
  userNextConfig,
  userSentryOptions,
  buildContext,
  releaseName,
  routeManifest,
  nextJsVersion,
}: {
  newConfig: WebpackConfigObjectWithModuleRules;
  userNextConfig: NextConfigObject;
  userSentryOptions: SentryBuildOptions;
  buildContext: BuildContext;
  releaseName: string | undefined;
  routeManifest: RouteManifest | undefined;
  nextJsVersion: string | undefined;
}): void {
  const assetPrefix = userNextConfig.assetPrefix || userNextConfig.basePath || '';

  // Check if release creation is disabled to prevent injection that breaks build determinism
  const shouldCreateRelease = userSentryOptions.release?.create !== false;
  const releaseToInject = releaseName && shouldCreateRelease ? releaseName : undefined;

  const isomorphicValues = {
    // `rewritesTunnel` set by the user in Next.js config
    _sentryRewritesTunnelPath:
      userSentryOptions.tunnelRoute !== undefined &&
      userNextConfig.output !== 'export' &&
      typeof userSentryOptions.tunnelRoute === 'string'
        ? `${userNextConfig.basePath ?? ''}${userSentryOptions.tunnelRoute}`
        : undefined,

    // The webpack plugin's release injection breaks the `app` directory so we inject the release manually here instead.
    // Having a release defined in dev-mode spams releases in Sentry so we only set one in non-dev mode
    // Only inject if release creation is not explicitly disabled (to maintain build determinism)
    SENTRY_RELEASE: releaseToInject && !buildContext.dev ? { id: releaseToInject } : undefined,
    _sentryBasePath: buildContext.dev ? userNextConfig.basePath : undefined,
    // This is used to determine version-based dev-symbolication behavior
    _sentryNextJsVersion: nextJsVersion,
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
    _sentryAssetPrefix: userNextConfig.assetPrefix,
    _sentryExperimentalThirdPartyOriginStackFrames: userSentryOptions._experimental?.thirdPartyOriginStackFrames
      ? 'true'
      : undefined,
    _sentryRouteManifest: JSON.stringify(routeManifest),
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
      test: /(?:sentry\.client\.config\.(jsx?|tsx?)|(?:src[\\/])?instrumentation-client\.(js|ts))$/,
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
    return path.dirname(createRequire(`${basedir}/`).resolve('next/package.json'));
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
    { module: /require-in-the-middle/, message: /Critical dependency/ },
  ] satisfies IgnoreWarningsOption;

  if (newConfig.ignoreWarnings === undefined) {
    newConfig.ignoreWarnings = ignoreRules;
  } else if (Array.isArray(newConfig.ignoreWarnings)) {
    newConfig.ignoreWarnings.push(...ignoreRules);
  }
}

function addEdgeRuntimePolyfills(newConfig: WebpackConfigObjectWithModuleRules, buildContext: BuildContext): void {
  // Use ProvidePlugin to inject performance global only when accessed
  newConfig.plugins = newConfig.plugins || [];
  newConfig.plugins.push(
    new buildContext.webpack.ProvidePlugin({
      performance: [path.resolve(__dirname, 'polyfills', 'perf_hooks.js'), 'performance'],
    }),
  );

  // Add module resolution aliases for problematic Node.js modules in edge runtime
  newConfig.resolve = newConfig.resolve || {};
  newConfig.resolve.alias = {
    ...newConfig.resolve.alias,
    // Redirect perf_hooks imports to a polyfilled version
    perf_hooks: path.resolve(__dirname, 'polyfills', 'perf_hooks.js'),
  };
}

function _getModules(projectDir: string): Record<string, string> {
  try {
    const packageJson = path.join(projectDir, 'package.json');
    const packageJsonContent = fs.readFileSync(packageJson, 'utf8');
    const packageJsonObject = JSON.parse(packageJsonContent) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return {
      ...packageJsonObject.dependencies,
      ...packageJsonObject.devDependencies,
    };
  } catch {
    return {};
  }
}

/**
 * Sets up the tree-shaking flags based on the user's configuration.
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/tree-shaking/
 */
function setupTreeshakingFromConfig(
  userSentryOptions: SentryBuildOptions,
  newConfig: WebpackConfigObjectWithModuleRules,
  buildContext: BuildContext,
): void {
  const defines: Record<string, boolean> = {};

  newConfig.plugins = newConfig.plugins || [];

  if (userSentryOptions.webpack?.treeshake?.removeDebugLogging) {
    defines.__SENTRY_DEBUG__ = false;
  }

  if (userSentryOptions.webpack?.treeshake?.removeTracing) {
    defines.__SENTRY_TRACING__ = false;
  }

  if (userSentryOptions.webpack?.treeshake?.excludeReplayIframe) {
    defines.__RRWEB_EXCLUDE_IFRAME__ = true;
  }

  if (userSentryOptions.webpack?.treeshake?.excludeReplayShadowDOM) {
    defines.__RRWEB_EXCLUDE_SHADOW_DOM__ = true;
  }

  if (userSentryOptions.webpack?.treeshake?.excludeReplayCompressionWorker) {
    defines.__SENTRY_EXCLUDE_REPLAY_WORKER__ = true;
  }

  // Only add DefinePlugin if there are actual defines to set
  if (Object.keys(defines).length > 0) {
    newConfig.plugins.push(new buildContext.webpack.DefinePlugin(defines));
  }
}
