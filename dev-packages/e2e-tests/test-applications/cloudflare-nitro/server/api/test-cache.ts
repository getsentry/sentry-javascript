import { defineCachedFunction } from 'nitro/cache';
import { defineHandler, getQuery } from 'nitro/h3';

const getCachedUser = defineCachedFunction(
  async (userId: string) => {
    return { id: userId, name: `User ${userId}`, timestamp: Date.now() };
  },
  {
    maxAge: 60,
    name: 'getCachedUser',
    getKey: (userId: string) => `user:${userId}`,
  },
);

export default defineHandler(async event => {
  const userId = String(getQuery(event).user ?? '123');

  // First call is a cache miss (a `cache.put`), the second is a hit (a `cache.get`).
  const first = await getCachedUser(userId);
  const second = await getCachedUser(userId);

  return { first, second };
});
