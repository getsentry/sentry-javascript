import { readFileSync, writeFileSync } from 'node:fs';
import { consoleSandbox, debug } from '@sentry/core';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { AstroConfig, AstroIntegration, RoutePart } from 'astro';
import * as fs from 'fs';
import * as path from 'path';
import { buildClientSnippet, buildSdkInitFileImportSnippet, buildServerSnippet } from './snippets';
import type { IntegrationResolvedRoute, SentryOptions } from './types';

const PKG_NAME = '@sentry/astro';

export const sentryAstro = (options: SentryOptions = {}): AstroIntegration => {
  let sentryServerInitPath: string | undefined;
  let didSaveRouteData = false;

  return {
    name: PKG_NAME,
    hooks: {
      // eslint-disable-next-line complexity
      'astro:config:setup': async ({ updateConfig, injectScript, addMiddleware, config, command, logger }) => {
        // The third param here enables loading of all env vars, regardless of prefix
        // see: https://main.vitejs.dev/config/#using-environment-variables-in-config

        // TODO: Ideally, we want to load the environment with vite like this:
        // const env = loadEnv('production', process.cwd(), '');
        // However, this currently throws a build error.
        // Will revisit this later.
        const env = process.env;

        const {
          enabled,
          clientInitPath,
          serverInitPath,
          autoInstrumentation,
          sourceMapsUploadOptions,
          bundleSizeOptimizations,
          debug,
          ...otherOptions
        } = options;

        const otherOptionsKeys = Object.keys(otherOptions);
        if (otherOptionsKeys.length > 0) {
          consoleSandbox(() => {
            //  eslint-disable-next-line no-console
            console.warn(
              `[Sentry] You passed in additional options (${otherOptionsKeys.join(
                ', ',
              )}) to the Sentry integration. This is deprecated and will stop working in a future version. Instead, configure the Sentry SDK in your \`sentry.client.config.(js|ts)\` or \`sentry.server.config.(js|ts)\` files.`,
            );
          });
        }

        const sdkEnabled = {
          client: typeof enabled === 'boolean' ? enabled : enabled?.client ?? true,
          server: typeof enabled === 'boolean' ? enabled : enabled?.server ?? true,
        };

        const sourceMapsNeeded = sdkEnabled.client || sdkEnabled.server;
        const { unstable_sentryVitePluginOptions, ...uploadOptions } = sourceMapsUploadOptions || {};
        const shouldUploadSourcemaps = (sourceMapsNeeded && uploadOptions?.enabled) ?? true;

        // We don't need to check for AUTH_TOKEN here, because the plugin will pick it up from the env
        if (shouldUploadSourcemaps && command !== 'dev') {
          const computedSourceMapSettings = getUpdatedSourceMapSettings(config, options);

          let updatedFilesToDeleteAfterUpload: string[] | undefined = undefined;

          if (
            typeof uploadOptions?.filesToDeleteAfterUpload === 'undefined' &&
            computedSourceMapSettings.previousUserSourceMapSetting === 'unset'
          ) {
            // This also works for adapters, as the source maps are also copied to e.g. the .vercel folder
            updatedFilesToDeleteAfterUpload = ['./dist/**/client/**/*.map', './dist/**/server/**/*.map'];

            consoleSandbox(() => {
              // eslint-disable-next-line no-console
              console.log(
                `[Sentry] Automatically setting \`sourceMapsUploadOptions.filesToDeleteAfterUpload: ${JSON.stringify(
                  updatedFilesToDeleteAfterUpload,
                )}\` to delete generated source maps after they were uploaded to Sentry.`,
              );
            });
          }

          updateConfig({
            vite: {
              build: {
                sourcemap: computedSourceMapSettings.updatedSourceMapSetting,
              },
              plugins: [
                sentryVitePlugin({
                  org: uploadOptions.org ?? env.SENTRY_ORG,
                  project: uploadOptions.project ?? env.SENTRY_PROJECT,
                  authToken: uploadOptions.authToken ?? env.SENTRY_AUTH_TOKEN,
                  telemetry: uploadOptions.telemetry ?? true,
                  _metaOptions: {
                    telemetry: {
                      metaFramework: 'astro',
                    },
                  },
                  ...unstable_sentryVitePluginOptions,
                  debug: debug ?? false,
                  sourcemaps: {
                    assets: uploadOptions.assets ?? [getSourcemapsAssetsGlob(config)],
                    filesToDeleteAfterUpload:
                      uploadOptions?.filesToDeleteAfterUpload ?? updatedFilesToDeleteAfterUpload,
                    ...unstable_sentryVitePluginOptions?.sourcemaps,
                  },
                  bundleSizeOptimizations: {
                    ...bundleSizeOptimizations,
                    ...unstable_sentryVitePluginOptions?.bundleSizeOptimizations,
                  },
                }),
              ],
            },
          });
        }

        if (sdkEnabled.client) {
          const pathToClientInit = clientInitPath ? path.resolve(clientInitPath) : findDefaultSdkInitFile('client');

          if (pathToClientInit) {
            debug && logger.info(`Using ${pathToClientInit} for client init.`);
            injectScript('page', buildSdkInitFileImportSnippet(pathToClientInit));
          } else {
            debug && logger.info('Using default client init.');
            injectScript('page', buildClientSnippet(options || {}));
          }
        }

        if (sdkEnabled.server) {
          const pathToServerInit = serverInitPath ? path.resolve(serverInitPath) : findDefaultSdkInitFile('server');
          if (pathToServerInit) {
            debug && logger.info(`Using ${pathToServerInit} for server init.`);
            injectScript('page-ssr', buildSdkInitFileImportSnippet(pathToServerInit));
          } else {
            debug && logger.info('Using default server init.');
            injectScript('page-ssr', buildServerSnippet(options || {}));
          }

          sentryServerInitPath = pathToServerInit;

          // Prevent Sentry from being externalized for SSR.
          // Cloudflare like environments have Node.js APIs are available under `node:` prefix.
          // Ref: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
          if (config?.adapter?.name.startsWith('@astrojs/cloudflare')) {
            updateConfig({
              vite: {
                ssr: {
                  // @sentry/node is required in case we have 2 different @sentry/node
                  // packages installed in the same project.
                  // Ref: https://github.com/getsentry/sentry-javascript/issues/10121
                  noExternal: ['@sentry/astro', '@sentry/node'],
                },
              },
            });
          }
        }

        const isSSR = config && (config.output === 'server' || config.output === 'hybrid');
        const shouldAddMiddleware = sdkEnabled.server && autoInstrumentation?.requestHandler !== false;

        // Guarding calling the addMiddleware function because it was only introduced in astro@3.5.0
        // Users on older versions of astro will need to add the middleware manually.
        const supportsAddMiddleware = typeof addMiddleware === 'function';

        if (supportsAddMiddleware && isSSR && shouldAddMiddleware) {
          addMiddleware({
            order: 'pre',
            entrypoint: '@sentry/astro/middleware',
          });
        }
      },

      // @ts-expect-error - This hook is available in Astro 5+
      'astro:routes:resolved': ({ routes }: { routes: IntegrationResolvedRoute[] }) => {
        if (!sentryServerInitPath || didSaveRouteData) {
          return;
        }

        try {
          const serverInitContent = readFileSync(sentryServerInitPath, 'utf8');

          const updatedServerInitContent = `${serverInitContent}\nglobalThis["__sentryRouteInfo"] = ${JSON.stringify(
            routes.map(route => {
              return {
                ...route,
                patternCaseSensitive: joinRouteSegments(route.segments), // Store parametrized routes with correct casing on `globalThis` to be able to use them on the server during runtime
                patternRegex: route.patternRegex.source, // using `source` to be able to serialize the regex
              };
            }),
            null,
            2,
          )};`;

          writeFileSync(sentryServerInitPath, updatedServerInitContent, 'utf8');

          didSaveRouteData = true; // Prevents writing the file multiple times during runtime
          debug.log('Successfully added route pattern information to Sentry config file:', sentryServerInitPath);
        } catch (error) {
          debug.warn(`Failed to write to Sentry config file at ${sentryServerInitPath}:`, error);
        }
      },
    },
  };
};

const possibleFileExtensions = ['ts', 'js', 'tsx', 'jsx', 'mjs', 'cjs', 'mts'];

function findDefaultSdkInitFile(type: 'server' | 'client'): string | undefined {
  const cwd = process.cwd();
  return possibleFileExtensions
    .map(e => path.resolve(path.join(cwd, `sentry.${type}.config.${e}`)))
    .find(filename => fs.existsSync(filename));
}

function getSourcemapsAssetsGlob(config: AstroConfig): string {
  // The vercel adapter puts the output into its .vercel directory
  // However, the way this adapter is written, the config.outDir value is update too late for
  // us to reliably detect it. Also, server files are first temporarily written to <root>/dist and then
  // only copied over to <root>/.vercel. This seems to happen too late though.
  // So we glob on both of these directories.
  // Another case of "it ain't pretty but it works":(
  if (config.adapter?.name?.startsWith('@astrojs/vercel')) {
    return '{.vercel,dist}/**/*';
  }

  // paths are stored as "file://" URLs
  const outDirPathname = config.outDir && path.resolve(config.outDir.pathname);
  const rootDirName = path.resolve(config.root?.pathname || process.cwd());

  if (outDirPathname) {
    const relativePath = path.relative(rootDirName, outDirPathname);
    return `${relativePath}/**/*`;
  }

  // fallback to default output dir
  return 'dist/**/*';
}

/**
 * Whether the user enabled (true, 'hidden', 'inline') or disabled (false) source maps
 */
export type UserSourceMapSetting = 'enabled' | 'disabled' | 'unset' | undefined;

/** There are 3 ways to set up source map generation (https://github.com/getsentry/sentry-javascript/issues/13993)
 *
 *     1. User explicitly disabled source maps
 *       - keep this setting (emit a warning that errors won't be unminified in Sentry)
 *       - We won't upload anything
 *
 *     2. Users enabled source map generation (true, 'hidden', 'inline').
 *       - keep this setting (don't do anything - like deletion - besides uploading)
 *
 *     3. Users didn't set source maps generation
 *       - we enable 'hidden' source maps generation
 *       - configure `filesToDeleteAfterUpload` to delete all .map files (we emit a log about this)
 *
 * --> only exported for testing
 */
export function getUpdatedSourceMapSettings(
  astroConfig: AstroConfig,
  sentryOptions?: SentryOptions,
): { previousUserSourceMapSetting: UserSourceMapSetting; updatedSourceMapSetting: boolean | 'inline' | 'hidden' } {
  let previousUserSourceMapSetting: UserSourceMapSetting = undefined;

  astroConfig.build = astroConfig.build || {};

  const viteSourceMap = astroConfig?.vite?.build?.sourcemap;
  let updatedSourceMapSetting = viteSourceMap;

  const settingKey = 'vite.build.sourcemap';

  if (viteSourceMap === false) {
    previousUserSourceMapSetting = 'disabled';
    updatedSourceMapSetting = viteSourceMap;

    consoleSandbox(() => {
      //  eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Source map generation is currently disabled in your Astro configuration (\`${settingKey}: false\`). This setting is either a default setting or was explicitly set in your configuration. Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified. To show unminified code, enable source maps in \`${settingKey}\` (e.g. by setting them to \`hidden\`).`,
      );
    });
  } else if (viteSourceMap && ['hidden', 'inline', true].includes(viteSourceMap)) {
    previousUserSourceMapSetting = 'enabled';
    updatedSourceMapSetting = viteSourceMap;

    if (sentryOptions?.debug) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.log(
          `[Sentry] We discovered \`${settingKey}\` is set to \`${viteSourceMap.toString()}\`. Sentry will keep this source map setting. This will un-minify the code snippet on the Sentry Issue page.`,
        );
      });
    }
  } else {
    previousUserSourceMapSetting = 'unset';
    updatedSourceMapSetting = 'hidden';

    consoleSandbox(() => {
      //  eslint-disable-next-line no-console
      console.log(
        `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps will be deleted after they were uploaded to Sentry.`,
      );
    });
  }

  return { previousUserSourceMapSetting, updatedSourceMapSetting };
}

/**
 * Join Astro route segments into a case-sensitive single path string.
 *
 * Astro lowercases the parametrized route. Joining segments manually is recommended to get the correct casing of the routes.
 * Recommendation in comment: https://github.com/withastro/astro/issues/13885#issuecomment-2934203029
 * Function Reference: https://github.com/joanrieu/astro-typed-links/blob/b3dc12c6fe8d672a2bc2ae2ccc57c8071bbd09fa/package/src/integration.ts#L16
 */
function joinRouteSegments(segments: RoutePart[][]): string {
  const parthArray = segments.map(segment =>
    segment.map(routePart => (routePart.dynamic ? `[${routePart.content}]` : routePart.content)).join(''),
  );

  return `/${parthArray.join('/')}`;
}
