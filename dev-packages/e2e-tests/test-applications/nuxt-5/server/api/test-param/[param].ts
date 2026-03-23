import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';

export default defineHandler(event => {
  const param = getRouterParam(event, 'param');

  return `Param: ${param}!`;
});
