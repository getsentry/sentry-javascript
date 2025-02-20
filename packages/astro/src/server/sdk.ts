import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    ...options,
    registerEsmLoaderHooks: mergeRegisterEsmLoaderHooks(options),
  };

  applySdkMetadata(opts, 'astro', ['astro', 'node']);

  return initNodeSdk(opts);
}

/**
 * Adds /vue/ to the registerEsmLoaderHooks options and merges it with the old values in the array if one is defined.
 * If the registerEsmLoaderHooks option is already a boolean, nothing is changed.
 *
 * Only exported for Testing purposes.
 */
export function mergeRegisterEsmLoaderHooks(options: NodeOptions): NodeOptions['registerEsmLoaderHooks'] {
  if (typeof options.registerEsmLoaderHooks === 'object' && options.registerEsmLoaderHooks !== null) {
    return {
      // eslint-disable-next-line deprecation/deprecation
      exclude: Array.isArray(options.registerEsmLoaderHooks.exclude)
        ? // eslint-disable-next-line deprecation/deprecation
          [...options.registerEsmLoaderHooks.exclude, /vue/]
        : // eslint-disable-next-line deprecation/deprecation
          options.registerEsmLoaderHooks.exclude ?? [/vue/],
    };
  }
  return options.registerEsmLoaderHooks ?? { exclude: [/vue/] };
}
