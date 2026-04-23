import { definePlugin } from 'nitro';
import { captureErrorHook } from '../hooks/captureErrorHook';
import { captureTracingEvents } from '../hooks/captureTracingEvents';

export default definePlugin(nitroApp => {
  nitroApp.hooks.hook('error', captureErrorHook);

  captureTracingEvents();
});
