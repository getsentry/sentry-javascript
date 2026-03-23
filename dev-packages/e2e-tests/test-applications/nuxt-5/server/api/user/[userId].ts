import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';

export default defineHandler(event => {
  const userId = getRouterParam(event, 'userId');

  return `UserId Param: ${userId}!`;
});
