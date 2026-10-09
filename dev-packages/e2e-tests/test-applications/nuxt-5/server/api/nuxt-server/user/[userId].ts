import { defineEventHandler, getRouterParam } from 'nuxt/server';

export default defineEventHandler(event => {
  const userId = getRouterParam(event, 'userId');

  return `UserId Param: ${userId}!`;
});
