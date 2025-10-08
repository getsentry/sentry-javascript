import { defineEventHandler, setHeader, getQuery } from '#imports';

export default defineEventHandler({
  onRequest: async event => {
    // Set a header to indicate the onRequest hook ran
    setHeader(event, 'x-hooks-onrequest', 'executed');

    // Check if we should throw an error in onRequest
    const query = getQuery(event);
    if (query.throwOnRequestError === 'true') {
      throw new Error('OnRequest hook error');
    }
  },

  handler: async event => {
    // Set a header to indicate the main handler ran
    setHeader(event, 'x-hooks-handler', 'executed');

    // Check if we should throw an error in handler
    const query = getQuery(event);
    if (query.throwHandlerError === 'true') {
      throw new Error('Handler error');
    }
  },

  onBeforeResponse: async (event, response) => {
    // Set a header to indicate the onBeforeResponse hook ran
    setHeader(event, 'x-hooks-onbeforeresponse', 'executed');

    // Check if we should throw an error in onBeforeResponse
    const query = getQuery(event);
    if (query.throwOnBeforeResponseError === 'true') {
      throw new Error('OnBeforeResponse hook error');
    }
  },
});
