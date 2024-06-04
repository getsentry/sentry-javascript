import type { CommandArgs as IORedisCommandArgs } from '@opentelemetry/instrumentation-ioredis';

export const GET_COMMANDS = ['get', 'mget'];
export const SET_COMMANDS = ['set' /* todo: 'setex' */];
// todo: del, expire

/** Determine cache operation based on redis statement */
export function getCacheOperation(
  statement: string,
): 'cache.get' | 'cache.put' | 'cache.remove' | 'cache.flush' | undefined {
  const lowercaseStatement = statement.toLowerCase();

  if (GET_COMMANDS.includes(lowercaseStatement)) {
    return 'cache.get';
  } else if (SET_COMMANDS.includes(lowercaseStatement)) {
    return 'cache.put';
  } else {
    return undefined;
  }
}

function keyHasPrefix(key: string, prefixes: string[]): boolean {
  return prefixes.some(prefix => key.startsWith(prefix));
}

/** Safely converts a redis key to a string (comma-separated if there are multiple keys) */
export function getCacheKeySafely(cmdArgs: IORedisCommandArgs): string {
  try {
    if (cmdArgs.length === 0) {
      return '';
    }

    const keys: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processArg = (arg: string | Buffer | number | any[]): void => {
      if (typeof arg === 'string' || typeof arg === 'number' || Buffer.isBuffer(arg)) {
        keys.push(arg.toString());
      } else if (Array.isArray(arg)) {
        arg.forEach(processArg);
      } else {
        keys.push('<unknown>');
      }
    };

    cmdArgs.forEach(processArg);

    return keys.join(', ');
  } catch (e) {
    return '';
  }
}

/** Determines whether a redis operation should be considered as "cache operation" by checking if a key is prefixed.
 *  We only support certain commands (such as 'set', 'get', 'mget'). */
export function shouldConsiderForCache(redisCommand: string, key: string, prefixes: string[]): boolean {
  const lowercaseCommand = redisCommand.toLowerCase();
  if (!SET_COMMANDS.includes(lowercaseCommand) && !GET_COMMANDS.includes(lowercaseCommand)) return false;

  return key.split(',').reduce((prev, key) => prev || keyHasPrefix(key, prefixes), false);
}

/** Calculates size based on the cache response value */
export function calculateCacheItemSize(response: unknown): number | undefined {
  try {
    if (Buffer.isBuffer(response)) return response.byteLength;
    else if (typeof response === 'string') return response.length;
    else if (typeof response === 'number') return response.toString().length;
    else if (response === null || response === undefined) return 0;
    return JSON.stringify(response).length;
  } catch (e) {
    return undefined;
  }
}
