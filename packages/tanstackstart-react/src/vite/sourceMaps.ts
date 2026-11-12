import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import * as path from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import {
  hasOutputSourceMapSetting,
  isNitroService,
  NITRO_ENVIRONMENT,
  type PluginEnvironment,
} from './nitroSourceMaps';
import type { SentryTanstackStartOptions } from './sentryTanstackStart';

/** TanStack Router and Start split route files into virtual modules, e.g. `index.tsx?tss-serverfn-split`. */
const TANSTACK_SPLIT_QUERY_REGEX = /\?ts[rs]-[^/]*$/;

/** Sources such as `virtual:#nitro/runtime` are no file paths. Two letters at least, so drive letters, like `C:`, are not matched by the regex. */
const SCHEME_REGEX = /^[a-z][a-z\d+.-]+:/i;

/**
 * Makes source paths relative to the project root and removes TanStack's split queries, so that client and server
 * frames show the path of the source file, such as `src/routes/index.tsx`.
 *
 * Paths in a source map are relative to the map's directory, which the default hook ignores.
 *
 * @internal Only exported for testing.
 */
export function rewriteTanstackStartSource(source: string, _map: unknown, context?: { mapDir: string }): string {
  const sourcePath = source.replace(TANSTACK_SPLIT_QUERY_REGEX, '');

  if (SCHEME_REGEX.test(sourcePath)) {
    return sourcePath;
  }

  const absolutePath = path.resolve(context?.mapDir ?? process.cwd(), sourcePath);
  return path.relative(process.cwd(), absolutePath).split(path.sep).join('/');
}

/** Shared by the source map plugins of one build. */
export type SourceMapState = {
  /** The SDK set the top-level `build.sourcemap` to `'hidden'`. */
  sdkEnabledSourceMaps: boolean;
  /** The SDK set the `sourcemap` option of Nitro to `'hidden'`. */
  sdkEnabledNitroSourceMaps: boolean;
};

export function createSourceMapState(): SourceMapState {
  return { sdkEnabledSourceMaps: false, sdkEnabledNitroSourceMaps: false };
}

/**
 * Whether the SDK turned on the source maps that the bundler plugin decides on. The plugin passes the name of an
 * environment with its own `build.sourcemap`, and `undefined` for the top-level setting. With `nitro/vite`, the `ssr`
 * service has its own setting too: Nitro reads its maps after the build, so they stay.
 */
function hasSdkEnabledSourceMaps(state: SourceMapState, environment: string | undefined): boolean {
  if (environment === undefined) {
    return state.sdkEnabledSourceMaps;
  }
  return environment === NITRO_ENVIRONMENT && state.sdkEnabledNitroSourceMaps;
}

/**
 * A Sentry plugin for adding the @sentry/bundler-plugins/vite to automatically upload source maps to Sentry.
 */
export function makeAddSentryVitePlugin(
  options: SentryTanstackStartOptions,
  state: SourceMapState = createSourceMapState(),
): Plugin[] {
  const {
    applicationKey,
    authToken,
    bundleSizeOptimizations,
    debug,
    errorHandler,
    headers,
    moduleMetadata,
    org,
    project,
    release,
    sentryUrl,
    silent,
    sourcemaps,
    telemetry,
    reactComponentAnnotation,
  } = options;

  const sentryPlugins = sentryVitePlugin({
    applicationKey,
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations: bundleSizeOptimizations ?? undefined,
    debug: debug ?? false,
    errorHandler,
    headers,
    moduleMetadata,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    release,
    silent,
    sourcemaps: {
      assets: sourcemaps?.assets,
      disable: sourcemaps?.disable,
      ignore: sourcemaps?.ignore,
      rewriteSources: sourcemaps?.rewriteSources ?? rewriteTanstackStartSource,
      resolveSourceMap: sourcemaps?.resolveSourceMap,
      filesToDeleteAfterUpload: sourcemaps?.filesToDeleteAfterUpload,
      // Called when the bundler plugin decides, after the SDK's enable plugins ran.
      deleteSourcemapsAfterUpload: environment =>
        sourcemaps?.deleteSourcemapsAfterUpload ?? (hasSdkEnabledSourceMaps(state, environment) || undefined),
      sdkEnabledSourceMaps: environment => hasSdkEnabledSourceMaps(state, environment),
    },
    reactComponentAnnotation: {
      enabled: reactComponentAnnotation?.enabled ?? undefined,
      ignoredComponents: reactComponentAnnotation?.ignoredComponents ?? undefined,
    },
    telemetry: telemetry ?? true,
    url: sentryUrl,
    _metaOptions: {
      telemetry: {
        metaFramework: 'tanstackstart-react',
      },
    },
  });

  // Nitro bundles the output of its services again. Debug IDs from a service would end up in Nitro's output and point
  // to the service's source maps instead of Nitro's.
  return sentryPlugins.map(plugin => ({
    ...plugin,
    applyToEnvironment: (environment: PluginEnvironment) => !isNitroService(environment),
  }));
}

/**
 * A Sentry plugin for TanStack Start React to enable "hidden" source maps if they are unset.
 */
export function makeEnableSourceMapsVitePlugin(
  options: SentryTanstackStartOptions,
  state: SourceMapState = createSourceMapState(),
): Plugin[] {
  return [
    {
      name: 'sentry-tanstackstart-react-source-maps',
      apply: 'build',
      enforce: 'post',
      config(viteConfig) {
        const sourcemap = getUpdatedSourceMapSettings(viteConfig, options);
        state.sdkEnabledSourceMaps = sourcemap !== viteConfig.build?.sourcemap;
        return { build: { sourcemap } };
      },
    },
  ];
}

/** There are 3 ways to set up source map generation (https://github.com/getsentry/sentry-javascript/issues/13993)
 *
 *     1. User explicitly disabled source maps
 *       - keep this setting (emit a warning that errors won't be unminified in Sentry)
 *       - We won't upload anything
 *
 *     2. Users enabled source map generation (true, 'hidden', 'inline') or set `build.rolldownOptions.output.sourcemap`.
 *       - keep this setting (don't do anything - like deletion - besides uploading)
 *
 *     3. Users didn't set source maps generation
 *       - we enable 'hidden' source maps generation
 *       - pass `deleteSourcemapsAfterUpload: true`, so the bundler plugin removes these .map files from the build output
 *
 * @internal Only exported for testing.
 */
export function getUpdatedSourceMapSettings(
  viteConfig: UserConfig,
  sentryPluginOptions?: SentryTanstackStartOptions,
): boolean | 'inline' | 'hidden' | undefined {
  viteConfig.build = viteConfig.build || {};

  const viteUserSourceMapSetting = viteConfig.build?.sourcemap;
  const settingKey = 'vite.build.sourcemap';
  const debug = sentryPluginOptions?.debug;

  // Respect user source map setting if it is explicitly set
  if (viteUserSourceMapSetting === false) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Source map generation is currently disabled in your TanStack Start configuration (\`${settingKey}: false\`). Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Source map generation is disabled in your TanStack Start configuration.');
    }

    return viteUserSourceMapSetting;
  } else if (viteUserSourceMapSetting && ['hidden', 'inline', true].includes(viteUserSourceMapSetting)) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${viteUserSourceMapSetting.toString()}\`. Sentry will keep this source map setting.`,
      );
    }

    return viteUserSourceMapSetting;
  } else if (hasOutputSourceMapSetting(viteConfig.build)) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        '[Sentry] We discovered `vite.build.rolldownOptions.output.sourcemap`, which overrides `vite.build.sourcemap`. Sentry will keep this source map setting.',
      );
    }

    return undefined;
  }

  // If the user did not specify a source map setting, we enable 'hidden' by default
  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps will be removed from the build output.`,
    );
  }

  return 'hidden';
}
