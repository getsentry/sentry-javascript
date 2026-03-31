import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';

export default defineHandler({
  middleware: [
    async event => {
      // Set a header to indicate the middleware ran
      event.res?.headers.set('x-hooks-middleware', 'executed');

      // Check if we should throw an error in middleware
      const query = getQuery(event);
      if (query.throwOnRequestError === 'true') {
        throw new Error('OnRequest hook error');
      }
    },
  ],

  handler: async event => {
    // Set a header to indicate the main handler ran
    event.res?.headers.set('x-hooks-handler', 'executed');

    // Check if we should throw an error in handler
    const query = getQuery(event);
    if (query.throwHandlerError === 'true') {
      throw new Error('Handler error');
    }
  },
});
