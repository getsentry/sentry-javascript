import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import { warnOnRemovedBuildOptions } from '@sentry/core';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import type { AstroConfig, AstroIntegration, AstroIntegrationLogger } from 'astro';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import type { VitePlugin } from './cloudflare';
import { sentryCloudflareNodeWarningPlugin, sentryCloudflareVitePlugin } from './cloudflare';
import { makeServerInitVitePlugin, SENTRY_MIDDLEWARE_MODULE, SERVER_INIT_IMPORT } from './serverInit';
import { buildClientSnippet, buildSdkInitFileImportSnippet, buildServerSnippet } from './snippets';
import { getAstroTunnelOptions, makeTunnelOptionsVitePlugin, TUNNEL_OPTIONS_IMPORT } from './tunnel';
import type { SentryOptions } from './types';

const PKG_NAME = '@sentry/astro';

export const sentryAstro = (options: SentryOptions = {}): AstroIntegration => {
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
          sourcemaps,
          release,
          buildTimeInstrumentation,
          bundleSizeOptimizations,
          applicationKey,
          moduleMetadata,
          debug,
          org,
          project,
          authToken,
          sentryUrl,
          headers,
          telemetry,
          silent,
          errorHandler,
        } = options;

        warnOnRemovedBuildOptions(options, ['unstable_sentryVitePluginOptions', 'sourceMapsUploadOptions'], message =>
          logger.warn(message),
        );

        const sdkEnabled = {
          client: typeof enabled === 'boolean' ? enabled : (enabled?.client ?? true),
          server: typeof enabled === 'boolean' ? enabled : (enabled?.server ?? true),
        };

        const sourceMapsNeeded = sdkEnabled.client || sdkEnabled.server;
        const shouldUploadSourcemaps = sourceMapsNeeded && sourcemaps?.disable !== true;

        // We don't need to check for AUTH_TOKEN here, because the plugin will pick it up from the env
        if (shouldUploadSourcemaps && command !== 'dev') {
          const computedSourceMapSettings = _getUpdatedSourceMapSettings(config, options, logger);

          let updatedFilesToDeleteAfterUpload: string[] | undefined = undefined;

          if (
            typeof sourcemaps?.filesToDeleteAfterUpload === 'undefined' &&
            computedSourceMapSettings.previousUserSourceMapSetting === 'unset'
          ) {
            // This also works for adapters, as the source maps are also copied to e.g. the .vercel folder.
            // Static output has no client folder and writes client assets to `<outDir>/<build.assets>` instead.
            // Astro removes the hidden `.prerender` folder itself, but we don't want to rely on that.
            updatedFilesToDeleteAfterUpload = [
              './dist/**/client/**/*.map',
              './dist/**/server/**/*.map',
              `./dist/**/${config.build?.assets ?? '_astro'}/**/*.map`,
              './dist/**/.prerender/**/*.map',
            ];

            debug &&
              logger.info(
                `Automatically setting \`sourcemaps.filesToDeleteAfterUpload: ${JSON.stringify(
                  updatedFilesToDeleteAfterUpload,
                )}\` to delete generated source maps after they were uploaded to Sentry.`,
              );
          }

          updateConfig({
            vite: {
              build: {
                sourcemap: computedSourceMapSettings.updatedSourceMapSetting,
              },
              plugins: [
                sentryVitePlugin({
                  applicationKey,
                  moduleMetadata,
                  // Priority: top-level options > env vars
                  org: org ?? env.SENTRY_ORG,
                  project: project ?? env.SENTRY_PROJECT,
                  authToken: authToken ?? env.SENTRY_AUTH_TOKEN,
                  url: sentryUrl ?? env.SENTRY_URL,
                  headers,
                  telemetry: telemetry ?? true,
                  silent: silent ?? false,
                  errorHandler,
                  _metaOptions: {
                    telemetry: {
                      metaFramework: 'astro',
                    },
                  },
                  debug: debug ?? false,
                  release,
                  sourcemaps: {
                    ...sourcemaps,
                    assets: sourcemaps?.assets ?? getSourcemapsAssetsGlobs(config),
                    filesToDeleteAfterUpload: sourcemaps?.filesToDeleteAfterUpload ?? updatedFilesToDeleteAfterUpload,
                  },
                  bundleSizeOptimizations: {
                    ...bundleSizeOptimizations,
                  },
                }),
              ],
            },
          });
        }

        const tunnelOptions = getAstroTunnelOptions(config);
        if (tunnelOptions) {
          updateConfig({ vite: { plugins: [makeTunnelOptionsVitePlugin(tunnelOptions)] } });
        }
        const tunnelOptionsImport = tunnelOptions ? TUNNEL_OPTIONS_IMPORT : '';

        if (sdkEnabled.client) {
          const pathToClientInit = clientInitPath ? path.resolve(clientInitPath) : findDefaultSdkInitFile('client');

          if (pathToClientInit) {
            debug && logger.info(`Using ${pathToClientInit} for client init.`);
            injectScript('page', tunnelOptionsImport + buildSdkInitFileImportSnippet(pathToClientInit));
          } else {
            debug && logger.info('Using default client init.');
            injectScript('page', tunnelOptionsImport + buildClientSnippet(options || {}));
          }
        }

        const isCloudflare = config?.adapter?.name?.startsWith('@astrojs/cloudflare');
        const isCloudflareWorkers = isCloudflare && !isCloudflarePages();
        // That plugin adds its own orchestrion transform and wraps the Worker entry, which inits the
        // SDK from `instrument.server.*` or `env`. With its `autoInstrumentation: false`, the user's
        // own `withSentry` does the init. Either way, none of ours are needed.
        const usesCloudflareVitePlugin = isCloudflareWorkers && hasCloudflareVitePlugin(config);

        // Wire up the orchestrion code transform so instrumented server-side dependencies (e.g.
        // `mysql`, `ioredis`) get `diagnostics_channel` publishers injected into the SSR bundle at
        // build time, with no manual plugin setup. The plugin opts out internally when
        // `buildTimeInstrumentation` is `false`. Cloudflare Pages is skipped: it gets no
        // `withSentry` wrap, so nothing would read the marker the injected snippets write, and
        // keeping the transform off avoids bundling dead subscriber code.
        if (sdkEnabled.server && (!isCloudflare || isCloudflareWorkers) && !usesCloudflareVitePlugin) {
          updateConfig({
            vite: {
              plugins: [sentryOrchestrionPlugin({ buildTimeInstrumentation }) as VitePlugin],
            },
          });
        }

        if (isCloudflare) {
          try {
            const _require = createRequire(`${process.cwd()}/`);
            _require.resolve('@sentry/cloudflare');
          } catch {
            logger.error(
              'You are using the Cloudflare adapter but `@sentry/cloudflare` is not installed. ' +
                'Please install the `@sentry/cloudflare` package in your project.',
            );
            process.exit(1);
          }
        }

        let serverInitSnippet = '';
        if (sdkEnabled.server) {
          const pathToServerInit = serverInitPath ? path.resolve(serverInitPath) : findDefaultSdkInitFile('server');

          if (pathToServerInit) {
            debug && logger.info(`Using ${pathToServerInit} for server init.`);
            serverInitSnippet = tunnelOptionsImport + buildSdkInitFileImportSnippet(pathToServerInit);
          } else if (!usesCloudflareVitePlugin) {
            debug && logger.info('Using default server init.');
            serverInitSnippet = tunnelOptionsImport + buildServerSnippet(options || {});
          }

          // Always inject the server config via `injectScript('page-ssr')`.
          // This ensures Sentry.init() runs in dev mode (where the Vite plugin doesn't fire)
          // and also serves as the fallback for non-Cloudflare adapters in production.
          if (serverInitSnippet) {
            updateConfig({ vite: { plugins: [makeServerInitVitePlugin(serverInitSnippet)] } });
            injectScript('page-ssr', SERVER_INIT_IMPORT);
          }

          if (isCloudflareWorkers && command !== 'dev') {
            // For Cloudflare Workers production builds, additionally use a Vite plugin to:
            // 1. Import the server config at the Worker entry level (so Sentry.init() runs
            //    for ALL requests, not just SSR pages — covers actions and API routes)
            // 2. Wrap the default export with `withSentry` from @sentry/cloudflare for
            //    per-request isolation, async context, and trace propagation
            //
            // Note: We do NOT set `ssr.noExternal` here. The `@astrojs/cloudflare` adapter
            // already configures Vite to bundle all dependencies for Workers. Explicitly
            // adding `@sentry/node` to `noExternal` would cause Vite to emit dozens of
            // warnings about auto-externalizing Node.js built-in modules that @sentry/node
            // and its transitive dependencies (OpenTelemetry, etc.) import.
            debug && logger.info('Adding Cloudflare Vite plugin to wrap Worker entry with withSentry.');
            updateConfig({
              vite: {
                plugins: usesCloudflareVitePlugin
                  ? [sentryCloudflareNodeWarningPlugin()]
                  : [sentryCloudflareNodeWarningPlugin(), sentryCloudflareVitePlugin()],
              },
            });
          } else if (isCloudflare) {
            // Prevent Sentry from being externalized for SSR.
            // Cloudflare environments have Node.js APIs available under `node:` prefix.
            // Ref: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
            updateConfig({
              vite: {
                plugins: [sentryCloudflareNodeWarningPlugin()],
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

        // In Astro 5+, `config.output` is no longer explicitly set — having an adapter
        // implies SSR capability. We check for the adapter to handle this correctly.
        const isSSR = config && (config.output === 'server' || config.output === 'hybrid' || !!config.adapter);
        const shouldAddMiddleware = sdkEnabled.server && autoInstrumentation?.requestHandler !== false;

        if (isSSR && shouldAddMiddleware) {
          addMiddleware({
            order: 'pre',
            entrypoint: serverInitSnippet ? SENTRY_MIDDLEWARE_MODULE : '@sentry/astro/middleware',
          });
        }
      },
    },
  };
};

// Every sub-plugin of `sentryCloudflareVitePlugin()` but its orchestrion transform has this prefix,
// and some are added whatever its options are.
const CLOUDFLARE_VITE_PLUGIN_NAME_PREFIX = 'sentry-cloudflare-';

/**
 * Whether the user added `sentryCloudflareVitePlugin()` from `@sentry/cloudflare/vite`. It is
 * detected by name because importing it here would load `@sentry/cloudflare` and `wrangler` for
 * every Astro app.
 */
function hasCloudflareVitePlugin(config: AstroConfig): boolean {
  const pending: unknown[] = [config.vite?.plugins];
  while (pending.length > 0) {
    const plugin = pending.pop();
    if (Array.isArray(plugin)) {
      pending.push(...plugin);
    } else if (
      typeof plugin === 'object' &&
      plugin !== null &&
      String((plugin as { name?: unknown }).name).startsWith(CLOUDFLARE_VITE_PLUGIN_NAME_PREFIX)
    ) {
      return true;
    }
  }
  return false;
}

const possibleFileExtensions = ['ts', 'js', 'tsx', 'jsx', 'mjs', 'cjs', 'mts'];

function findDefaultSdkInitFile(type: 'server' | 'client'): string | undefined {
  const cwd = process.cwd();
  return possibleFileExtensions
    .map(e => path.resolve(path.join(cwd, `sentry.${type}.config.${e}`)))
    .find(filename => fs.existsSync(filename));
}

/**
 * Detects if the project is a Cloudflare Pages project by checking for
 * `pages_build_output_dir` in the wrangler configuration file.
 *
 * Cloudflare Pages projects use `pages_build_output_dir` while Workers projects
 * use `assets.directory` or `main` fields instead.
 */
function isCloudflarePages(): boolean {
  const cwd = process.cwd();
  const configFiles = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'];

  for (const configFile of configFiles) {
    const configPath = path.join(cwd, configFile);

    if (!fs.existsSync(configPath)) {
      continue;
    }

    const content = fs.readFileSync(configPath, 'utf-8');

    if (configFile.endsWith('.toml')) {
      // https://regex101.com/r/Uxe4p0/1
      // Match pages_build_output_dir as a TOML key (at start of line, ignoring whitespace)
      // This avoids false positives from comments (lines starting with #)
      return /^\s*pages_build_output_dir\s*=/m.test(content);
    }

    // Match "pages_build_output_dir" as a JSON key (followed by :)
    // This works for both .json and .jsonc without needing to strip comments
    return /"pages_build_output_dir"\s*:/.test(content);
  }

  return false;
}

function getSourcemapsAssetsGlobs(config: AstroConfig): string[] {
  const outDirGlob = getOutDirGlob(config);
  // Astro 7 writes the prerender build to a hidden `.prerender` folder, which `**` does not enter.
  // Its chunks only run at build time to render static pages, but we still upload them for errors captured then.
  return [`${outDirGlob}/**/*`, `${outDirGlob}/**/.prerender/**/*`];
}

function getOutDirGlob(config: AstroConfig): string {
  // The vercel adapter puts the output into its .vercel directory
  // However, the way this adapter is written, the config.outDir value is update too late for
  // us to reliably detect it. Also, server files are first temporarily written to <root>/dist and then
  // only copied over to <root>/.vercel. This seems to happen too late though.
  // So we glob on both of these directories.
  // Another case of "it ain't pretty but it works":(
  if (config.adapter?.name?.startsWith('@astrojs/vercel')) {
    return '{.vercel,dist}';
  }

  // paths are stored as "file://" URLs
  const outDirPathname = config.outDir && path.resolve(config.outDir.pathname);
  const rootDirName = path.resolve(config.root?.pathname || process.cwd());

  if (outDirPathname) {
    return path.relative(rootDirName, outDirPathname);
  }

  // fallback to default output dir
  return 'dist';
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
export function _getUpdatedSourceMapSettings(
  astroConfig: AstroConfig,
  sentryOptions: SentryOptions | undefined,
  logger: AstroIntegrationLogger,
): { previousUserSourceMapSetting: UserSourceMapSetting; updatedSourceMapSetting: boolean | 'inline' | 'hidden' } {
  let previousUserSourceMapSetting: UserSourceMapSetting = undefined;

  astroConfig.build = astroConfig.build || {};

  const viteSourceMap = astroConfig?.vite?.build?.sourcemap;
  let updatedSourceMapSetting = viteSourceMap;

  const settingKey = 'vite.build.sourcemap';
  const debug = sentryOptions?.debug;

  if (viteSourceMap === false) {
    previousUserSourceMapSetting = 'disabled';
    updatedSourceMapSetting = viteSourceMap;

    if (debug) {
      // Longer debug message with more details
      logger.warn(
        `Source map generation is currently disabled in your Astro configuration (\`${settingKey}: false\`). This setting is either a default setting or was explicitly set in your configuration. Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified. To show unminified code, enable source maps in \`${settingKey}\` (e.g. by setting them to \`hidden\`).`,
      );
    } else {
      logger.warn('Source map generation is disabled in your Astro configuration.');
    }
  } else if (viteSourceMap && ['hidden', 'inline', true].includes(viteSourceMap)) {
    previousUserSourceMapSetting = 'enabled';
    updatedSourceMapSetting = viteSourceMap;

    debug &&
      logger.info(
        `We discovered \`${settingKey}\` is set to \`${viteSourceMap.toString()}\`. Sentry will keep this source map setting. This will un-minify the code snippet on the Sentry Issue page.`,
      );
  } else {
    previousUserSourceMapSetting = 'unset';
    updatedSourceMapSetting = 'hidden';

    debug &&
      logger.info(
        `Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps will be deleted after they were uploaded to Sentry.`,
      );
  }

  return { previousUserSourceMapSetting, updatedSourceMapSetting };
}
