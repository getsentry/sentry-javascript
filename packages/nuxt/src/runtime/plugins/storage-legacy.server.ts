import type { NitroAppPlugin } from 'nitropack';
import { useStorage } from 'nitropack/runtime';
// @ts-expect-error - This is a virtual module
import { userStorageMounts } from '#sentry/storage-config.mjs';
import { createStoragePlugin } from '../utils/instrumentStorage';

/**
 * Nitro plugin that instruments storage driver calls for Nuxt v3/v4 (Nitro v2)
 */
export default (async _nitroApp => {
  await createStoragePlugin(useStorage, userStorageMounts as string[]);
}) satisfies NitroAppPlugin;
