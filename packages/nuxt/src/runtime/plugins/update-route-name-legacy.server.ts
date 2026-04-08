import type { NitroAppPlugin } from 'nitropack';
import { updateRouteBeforeResponse } from '../hooks/updateRouteBeforeResponse';

export default (nitroApp => {
  nitroApp.hooks.hook('beforeResponse', updateRouteBeforeResponse);
}) satisfies NitroAppPlugin;
