import { defineEventHandler, getRouterParam } from '#imports';

export default defineEventHandler(event => {
  const param = getRouterParam(event, 'param');

  return `Param: ${param}!`;
});
