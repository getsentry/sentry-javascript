import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';

export default defineHandler({
  onRequest: async event => {
    // Set a header to indicate the onRequest hook ran
    event.req.headers.set('x-hooks-onrequest', 'executed');

    // Check if we should throw an error in onRequest
    const query = getQuery(event);
    if (query.throwOnRequestError === 'true') {
      throw new Error('OnRequest hook error');
    }
  },

  handler: async event => {
    // Set a header to indicate the main handler ran
    event.res.headers.set('x-hooks-handler', 'executed');

    // Check if we should throw an error in handler
    const query = getQuery(event);
    if (query.throwHandlerError === 'true') {
      throw new Error('Handler error');
    }
  },

  onBeforeResponse: async (event, response) => {
    // Set a header to indicate the onBeforeResponse hook ran
    event.res.headers.set('x-hooks-onbeforeresponse', 'executed');

    // Check if we should throw an error in onBeforeResponse
    const query = getQuery(event);
    if (query.throwOnBeforeResponseError === 'true') {
      throw new Error('OnBeforeResponse hook error');
    }
  },
});
