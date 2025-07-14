import { defineEventHandler, getRouterParam } from '#imports';

export default defineEventHandler(event => {
  const userId = getRouterParam(event, 'userId');

  return `UserId Param: ${userId}!`;
});
