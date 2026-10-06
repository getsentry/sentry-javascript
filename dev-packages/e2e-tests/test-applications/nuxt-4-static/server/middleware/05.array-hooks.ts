import { defineEventHandler, setHeader, getQuery } from '#imports';

export default defineEventHandler({
  // Array of onRequest handlers
  onRequest: [
    async event => {
      setHeader(event, 'x-array-onrequest-0', 'executed');

      const query = getQuery(event);
      if (query.throwOnRequest0Error === 'true') {
        throw new Error('OnRequest[0] hook error');
      }
    },
    async event => {
      setHeader(event, 'x-array-onrequest-1', 'executed');

      const query = getQuery(event);
      if (query.throwOnRequest1Error === 'true') {
        throw new Error('OnRequest[1] hook error');
      }
    },
  ],

  handler: async event => {
    setHeader(event, 'x-array-handler', 'executed');
  },

  // Array of onBeforeResponse handlers
  onBeforeResponse: [
    async (event, response) => {
      setHeader(event, 'x-array-onbeforeresponse-0', 'executed');

      const query = getQuery(event);
      if (query.throwOnBeforeResponse0Error === 'true') {
        throw new Error('OnBeforeResponse[0] hook error');
      }
    },
    async (event, response) => {
      setHeader(event, 'x-array-onbeforeresponse-1', 'executed');

      const query = getQuery(event);
      if (query.throwOnBeforeResponse1Error === 'true') {
        throw new Error('OnBeforeResponse[1] hook error');
      }
    },
  ],
});
