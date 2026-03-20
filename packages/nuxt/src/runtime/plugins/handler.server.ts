import type { EventHandler } from 'nitro/h3';
import type { NitroAppPlugin, NitroApp } from 'nitro/types';
import { patchEventHandler } from '../utils/patchEventHandler';

/**
 * This plugin patches the h3 event handler for Nuxt v5+ (Nitro v3+).
 */
export default ((nitroApp: NitroApp) => {
  if (nitroApp?.h3?.handler) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    nitroApp.h3.handler = patchEventHandler<EventHandler>(nitroApp.h3.handler);
  }
}) satisfies NitroAppPlugin;
