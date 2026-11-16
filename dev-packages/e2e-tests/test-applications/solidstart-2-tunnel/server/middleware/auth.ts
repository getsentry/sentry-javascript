import { defineHandler, HTTPError } from 'nitro/h3';

export default defineHandler(event => {
  if (event.req.method === 'POST') {
    throw new HTTPError({ status: 401, statusText: 'blocked by user auth' });
  }
});
