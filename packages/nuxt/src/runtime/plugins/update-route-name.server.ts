import type { NitroAppPlugin } from 'nitro/types';
import { updateRouteBeforeResponse } from '../hooks/updateRouteBeforeResponse';
import type { H3Event } from 'h3';

export default (nitroApp => {
  // @ts-expect-error Hook in Nuxt 5 (Nitro 3) is called 'response' https://nitro.build/docs/plugins#available-hooks
  nitroApp.hooks.hook('response', (_response, event: H3Event) => updateRouteBeforeResponse(event));
}) satisfies NitroAppPlugin;
