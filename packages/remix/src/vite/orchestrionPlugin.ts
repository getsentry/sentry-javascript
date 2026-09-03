import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import type { ConfigEnv, Plugin, ResolvedConfig, UserConfig } from 'vite';
import type { SentryRemixVitePluginOptions } from './types';

type AnyHook = (this: unknown, ...args: never[]) => unknown;
type ObjectHook<T> = T | { order?: 'pre' | 'post' | null; handler: T };
type ConfigHook = (this: unknown, config: UserConfig, env: ConfigEnv) => unknown;

const WORKER_RESOLVE_CONDITIONS = ['workerd', 'worker'];

/**
 * Cloudflare Pages and Hydrogen/Oxygen builds instrument through `instrumentBuild()` from
 * `@sentry/remix/cloudflare`, which wraps the build instead of subscribing to diagnostics
 * channels. Transforming there would add a `node:diagnostics_channel` import and subscriber code
 * that nothing reads.
 *
 * Oxygen sets `ssr.target`, but Remix's own Vite plugin never does — a Cloudflare app is marked by
 * workerd resolve conditions instead (`cloudflareDevProxyVitePlugin` sets `externalConditions`,
 * the Cloudflare template sets `conditions`), so all three signals have to be checked.
 */
function isWorkerTarget(config: UserConfig | ResolvedConfig | undefined): boolean {
  const ssr = config?.ssr;
  if (ssr?.target === 'webworker') {
    return true;
  }

  return [ssr?.resolve?.conditions, ssr?.resolve?.externalConditions].some(conditions =>
    conditions?.some(condition => WORKER_RESOLVE_CONDITIONS.includes(condition)),
  );
}

function hookHandler<T extends AnyHook>(hook: ObjectHook<T> | undefined): T | undefined {
  return typeof hook === 'function' ? hook : hook?.handler;
}

/** No-ops a hook while `isDisabled()` holds, keeping its declared hook shape. */
function gateHook<T extends AnyHook>(
  hook: ObjectHook<T> | undefined,
  isDisabled: () => boolean,
): ObjectHook<T> | undefined {
  if (!hook) {
    return hook;
  }

  const handler = hookHandler(hook) as AnyHook;
  const gated = function (this: unknown, ...args: never[]): unknown {
    return isDisabled() ? null : handler.apply(this, args);
  } as T;

  return typeof hook === 'function' ? gated : { ...hook, handler: gated };
}

/** The orchestrion bundler plugin, wired to stay out of workerd builds. */
export function makeOrchestrionPlugin(options: Pick<SentryRemixVitePluginOptions, 'buildTimeInstrumentation'>): Plugin {
  const orchestrion = sentryOrchestrionPlugin({ buildTimeInstrumentation: options.buildTimeInstrumentation });
  const { renderChunk } = orchestrion as Plugin & { renderChunk?: ObjectHook<AnyHook> };
  const config = hookHandler(orchestrion.config as ObjectHook<ConfigHook> | undefined);
  const configResolved = hookHandler(orchestrion.configResolved);

  let isWorkerBuild = false;

  return {
    ...orchestrion,
    // Upstream ships the plugin with `enforce: 'pre'`, which would run this hook before the
    // framework plugins that set `ssr.target`. `order: 'post'` moves it after them.
    config: {
      order: 'post',
      handler(userConfig: UserConfig, env: ConfigEnv) {
        return isWorkerTarget(userConfig) ? null : (config?.(userConfig, env) ?? null);
      },
    },
    // The authoritative check: the resolved config reflects every plugin regardless of ordering,
    // and this always runs before the first `transform`.
    configResolved(resolvedConfig: ResolvedConfig) {
      isWorkerBuild = isWorkerTarget(resolvedConfig);
      return isWorkerBuild ? undefined : configResolved?.(resolvedConfig);
    },
    transform: gateHook(orchestrion.transform as ObjectHook<AnyHook> | undefined, () => isWorkerBuild),
    renderChunk: gateHook(renderChunk, () => isWorkerBuild),
  } as Plugin;
}
