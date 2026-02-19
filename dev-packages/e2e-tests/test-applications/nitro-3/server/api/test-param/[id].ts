import { defineHandler } from 'nitro/h3';

export default defineHandler(event => {
  const id = event.req.url;
  return { id };
});
