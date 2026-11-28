import { definePlugin } from 'nitro';

// Throws only in the server that `plugins.test.ts` starts with this variable, so the server of the other tests starts.
export default definePlugin(() => {
  if (process.env.E2E_PLUGIN_INIT_ERROR) {
    throw new Error('Error while a Nitro plugin initializes');
  }
});
