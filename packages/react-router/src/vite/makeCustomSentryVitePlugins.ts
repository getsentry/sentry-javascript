import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import { warnOnRemovedBuildOptions } from '@sentry/core';
import { type Plugin } from 'vite';
import type { SentryReactRouterBuildOptions } from './types';

type Consumer = 'client' | 'server';

type HookContext = { environment?: { config: { consumer: string } } };

const BUILD_HOOKS = ['buildStart', 'transform', 'renderChunk', 'generateBundle', 'writeBundle'] as const;

/**
 * Create a custom subset of sentry's vite plugins
 *
 * With `releaseAtRuntime`, the client build leaves the release out of its chunks, because the server passes it to
 * the browser SDK in the page instead.
 */
export async function makeCustomSentryVitePlugins(
  options: SentryReactRouterBuildOptions,
  { releaseAtRuntime = false }: { releaseAtRuntime?: boolean } = {},
): Promise<Plugin[]> {
  warnOnRemovedBuildOptions(options, ['unstable_sentryVitePluginOptions']);

  const {
    debug,
    bundleSizeOptimizations,
    applicationKey,
    authToken,
    errorHandler,
    headers,
    moduleMetadata,
    org,
    project,
    sentryUrl,
    silent,
    telemetry,
    reactComponentAnnotation,
    release,
  } = options;

  const pluginOptions = {
    applicationKey,
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations,
    debug: debug ?? false,
    errorHandler,
    headers,
    moduleMetadata,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    reactComponentAnnotation,
    release,
    silent,
    telemetry: telemetry ?? true,
    // Release creation runs in the plugin's `writeBundle` even with `sourcemaps.disable` set below,
    // so the plugin needs its own URL rather than relying on the `sentryOnBuildEnd` CLI instance.
    url: sentryUrl,
    _metaOptions: {
      telemetry: {
        metaFramework: 'react-router',
      },
    },
    sourcemaps: {
      // Debug ID injection and upload are handled by the `sentryOnBuildEnd` hook, so the Vite plugin
      // must never do it as well - that would inject a second debug ID per chunk and break source
      // map resolution.
      disable: true,
      // The plugin deletes these in a `finally` block that runs regardless of `disable`, which would
      // remove the maps before `sentryOnBuildEnd` gets to upload them. Deletion happens there instead.
      filesToDeleteAfterUpload: undefined,
    },
  };

  if (!releaseAtRuntime) {
    return sentryVitePlugin(pluginOptions) as Plugin[];
  }

  return [
    ...scopeToConsumer(
      sentryVitePlugin({ ...pluginOptions, release: { ...release, inject: false } }) as Plugin[],
      'client',
    ),
    ...scopeToConsumer(sentryVitePlugin(pluginOptions) as Plugin[], 'server'),
  ];
}

/**
 * Runs the build hooks of `plugins` only when Vite builds for `consumer`. Vite 6+ names the consumer of each
 * environment. Vite 5 has no environments and builds the client and the server separately, so there it is the
 * `build.ssr` setting.
 */
function scopeToConsumer(plugins: Plugin[], consumer: Consumer): Plugin[] {
  let ssrBuild = false;
  const applies = (context: HookContext | undefined): boolean =>
    (context?.environment?.config.consumer ?? (ssrBuild ? 'server' : 'client')) === consumer;

  return plugins.map(plugin => {
    const scoped: Record<string, unknown> = {
      ...plugin,
      configResolved(this: unknown, config: { build: { ssr?: unknown } }) {
        ssrBuild = !!config.build.ssr;
        return callHook(plugin.configResolved, this, [config]);
      },
    };

    for (const name of BUILD_HOOKS) {
      if (plugin[name]) {
        scoped[name] = gateHook(plugin[name], applies);
      }
    }

    // The hooks are replaced by name, and each Vite hook has its own type, so the copy is built as a plain record.
    return scoped as unknown as Plugin;
  });
}

function gateHook(hook: unknown, applies: (context: HookContext | undefined) => boolean): unknown {
  if (typeof hook === 'function') {
    return function (this: HookContext | undefined, ...args: unknown[]): unknown {
      return applies(this) ? hook.apply(this, args) : null;
    };
  }

  if (hook && typeof hook === 'object' && 'handler' in hook) {
    return { ...hook, handler: gateHook(hook.handler, applies) };
  }

  return hook;
}

function callHook(hook: unknown, context: unknown, args: unknown[]): unknown {
  const handler = hook && typeof hook === 'object' && 'handler' in hook ? hook.handler : hook;
  return typeof handler === 'function' ? handler.apply(context, args) : undefined;
}
