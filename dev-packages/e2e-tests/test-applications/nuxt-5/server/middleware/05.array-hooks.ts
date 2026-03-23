import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';

export default defineHandler({
  // Array of onRequest handlers
  onRequest: [
    async event => {
      event.res.headers.set('x-array-onrequest-0', 'executed');

      const query = getQuery(event);
      if (query.throwOnRequest0Error === 'true') {
        throw new Error('OnRequest[0] hook error');
      }
    },
    async event => {
      event.res.headers.set('x-array-onrequest-1', 'executed');

      const query = getQuery(event);
      if (query.throwOnRequest1Error === 'true') {
        throw new Error('OnRequest[1] hook error');
      }
    },
  ],

  handler: async event => {
    event.res.headers.set('x-array-handler', 'executed');
  },

  // Array of onBeforeResponse handlers
  onBeforeResponse: [
    async (event, response) => {
      event.res.headers.set('x-array-onbeforeresponse-0', 'executed');

      const query = getQuery(event);
      if (query.throwOnBeforeResponse0Error === 'true') {
        throw new Error('OnBeforeResponse[0] hook error');
      }
    },
    async (event, response) => {
      event.res.headers.set('x-array-onbeforeresponse-1', 'executed');

      const query = getQuery(event);
      if (query.throwOnBeforeResponse1Error === 'true') {
        throw new Error('OnBeforeResponse[1] hook error');
      }
    },
  ],
});
