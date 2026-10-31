import { defineHandler } from 'nitro';

export default defineHandler(async event => {
  // Set a header to indicate this middleware ran
  event.res?.headers.set('x-second-middleware', 'executed');
});
