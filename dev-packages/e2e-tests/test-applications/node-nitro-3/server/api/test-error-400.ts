import { defineHandler, HTTPError } from 'nitro/h3';

export default defineHandler(() => {
  throw new HTTPError({ status: 400, message: 'Explicit 400 test error' });
});
