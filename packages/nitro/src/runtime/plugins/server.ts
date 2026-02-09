import { definePlugin } from 'nitro';
import { captureErrorHook } from '../hooks/captureErrorHook';
import { captureTracingEvents } from '../hooks/captureTracingEvents';
import { setServerTimingHeaders } from '../hooks/setServerTimingHeaders';

export default definePlugin(nitroApp => {
  // FIXME: Nitro hooks are not typed it seems
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  nitroApp.hooks.hook('error', captureErrorHook);

  // FIXME: Nitro hooks are not typed it seems
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  nitroApp.hooks.hook('response', setServerTimingHeaders);

  captureTracingEvents();
});
