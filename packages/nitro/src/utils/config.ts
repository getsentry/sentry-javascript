import type { NitroConfig, NitroHooks } from 'nitropack/types';

/**
 * Adds a build-time hook to the Nitro config.
 */
export function addHook<THook extends keyof NitroHooks>(
  nitro: NitroConfig,
  hook: THook,
  callback: NitroHooks[THook],
): void {
  if (!nitro.hooks) {
    nitro.hooks = {};
  }

  if (!nitro.hooks.build) {
    nitro.hooks.build = {};
  }

  const path = hook.split(':');
  let current: Record<string, any> = nitro.hooks;

  for (const part of path) {
    // If the part is the last part, we don't need to create a new object
    if (part === path[path.length - 1]) {
      continue;
    }

    if (!current[part]) {
      current[part] = {};
    }

    current = current[part];
  }

  if (typeof current[hook] !== 'function') {
    current[hook] = callback;
    return;
  }

  current[hook] = async (...args: Parameters<NitroHooks[THook]>) => {
    await current[hook](...args);
    // eslint-disable-next-line prefer-spread
    await callback.apply(null, args);
  };
}
