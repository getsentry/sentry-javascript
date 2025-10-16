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

  const path = hook.split(':');
  let current: Record<string, any> = nitro.hooks;

  // Navigate to the nested object, creating it if it doesn't exist
  for (let i = 0; i < path.length - 1; i++) {
    const part = path[i] as string;
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }

  // Use the last part of the path as the key
  const hookKey = path[path.length - 1] as string;

  // If no existing hook, just set it
  if (typeof current[hookKey] !== 'function') {
    current[hookKey] = callback;
    return;
  }

  // If there's an existing hook, chain them
  const existingHook = current[hookKey];
  current[hookKey] = async (...args: Parameters<NitroHooks[THook]>) => {
    await existingHook(...args);
    // eslint-disable-next-line prefer-spread
    await callback.apply(null, args);
  };
}
