import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';

export default defineHandler({
  // Array of middleware handlers (replaces onRequest in h3 v2)
  middleware: [
    async event => {
      event.res?.headers.set('x-array-middleware-0', 'executed');

      const query = getQuery(event);
      if (query.throwOnRequest0Error === 'true') {
        throw new Error('OnRequest[0] hook error');
      }
    },
    async event => {
      event.res?.headers.set('x-array-middleware-1', 'executed');

      const query = getQuery(event);
      if (query.throwOnRequest1Error === 'true') {
        throw new Error('OnRequest[1] hook error');
      }
    },
  ],

  handler: async event => {
    event.res?.headers.set('x-array-handler', 'executed');
  },
});
