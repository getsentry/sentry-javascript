import { defineCachedFunction } from 'nitro/cache';
import { defineHandler, getQuery } from 'nitro/h3';

const getCachedUser = defineCachedFunction(async (userId: string) => ({ id: userId }), {
  maxAge: 60,
  name: 'getCachedUser',
  getKey: (userId: string) => `user:${userId}`,
});

export default defineHandler(async event => {
  const userId = String(getQuery(event).user ?? '123');
  // The first call misses the cache, the second one hits it.
  await getCachedUser(userId);
  return getCachedUser(userId);
});
