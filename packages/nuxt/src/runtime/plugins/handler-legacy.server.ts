import type { EventHandler } from 'h3';
import type { NitroAppPlugin } from 'nitropack';
import { patchEventHandler } from '../utils/patchEventHandler';

export default (nitroApp => {
  nitroApp.h3App.handler = patchEventHandler<EventHandler>(nitroApp.h3App.handler);
}) satisfies NitroAppPlugin;
