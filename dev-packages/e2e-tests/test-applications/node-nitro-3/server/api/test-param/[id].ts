import { defineHandler, getRouterParam } from 'nitro/h3';

export default defineHandler(event => {
  return { id: getRouterParam(event, 'id') };
});
