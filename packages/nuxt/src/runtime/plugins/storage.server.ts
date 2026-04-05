import type { NitroAppPlugin } from 'nitro/types';
import { useStorage } from 'nitro/storage';
// @ts-expect-error - This is a virtual module
import { userStorageMounts } from '#sentry/storage-config.mjs';
import { createStoragePlugin } from '../utils/instrumentStorage';

/**
 * Nitro plugin that instruments storage driver calls for Nuxt v5+ (Nitro v3+)
 */
export default (async _nitroApp => {
  await createStoragePlugin(useStorage, userStorageMounts as string[]);
}) satisfies NitroAppPlugin;
