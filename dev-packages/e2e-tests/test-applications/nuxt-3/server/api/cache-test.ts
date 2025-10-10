import { cachedFunction, defineCachedEventHandler, defineEventHandler, getQuery } from '#imports';

// Test cachedFunction
const getCachedUser = cachedFunction(
  async (userId: string) => {
    return {
      id: userId,
      name: `User ${userId}`,
      email: `user${userId}@example.com`,
      timestamp: Date.now(),
    };
  },
  {
    maxAge: 60,
    name: 'getCachedUser',
    getKey: (userId: string) => `user:${userId}`,
  },
);

// Test cachedFunction with different options
const getCachedData = cachedFunction(
  async (key: string) => {
    return {
      key,
      value: `cached-value-${key}`,
      timestamp: Date.now(),
    };
  },
  {
    maxAge: 120,
    name: 'getCachedData',
    getKey: (key: string) => `data:${key}`,
  },
);

// Test defineCachedEventHandler
const cachedHandler = defineCachedEventHandler(
  async event => {
    return {
      message: 'This response is cached',
      timestamp: Date.now(),
      path: event.path,
    };
  },
  {
    maxAge: 60,
    name: 'cachedHandler',
  },
);

export default defineEventHandler(async event => {
  const results: Record<string, unknown> = {};
  const testKey = String(getQuery(event).user ?? '');
  const dataKey = String(getQuery(event).data ?? '');

  // Test cachedFunction - first call (cache miss)
  const user1 = await getCachedUser(testKey);
  results.cachedUser1 = user1;

  // Test cachedFunction - second call (cache hit)
  const user2 = await getCachedUser(testKey);
  results.cachedUser2 = user2;

  // Test cachedFunction with different key (cache miss)
  const user3 = await getCachedUser(`${testKey}456`);
  results.cachedUser3 = user3;

  // Test another cachedFunction
  const data1 = await getCachedData(dataKey);
  results.cachedData1 = data1;

  // Test cachedFunction - cache hit
  const data2 = await getCachedData(dataKey);
  results.cachedData2 = data2;

  // Test cachedEventHandler by calling it
  const cachedResponse = await cachedHandler(event);
  results.cachedResponse = cachedResponse;

  return {
    success: true,
    results,
  };
});
