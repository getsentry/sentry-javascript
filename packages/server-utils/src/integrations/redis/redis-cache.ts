import {
  NET_PEER_NAME,
  NET_PEER_PORT,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
  truncate,
} from '@sentry/core';

// Runtime-agnostic on purpose: imports nothing from `node:*` and touches `Buffer` only inside
// function bodies (never at module load), so bundling this into an edge runtime is safe and the
// redis channel integrations can share one cache implementation across every server runtime.

export type RedisCommandArgs = Array<string | Buffer | number | unknown[]>;

const SINGLE_ARG_COMMANDS = ['get', 'set', 'setex'];

export const GET_COMMANDS = ['get', 'mget'];
export const SET_COMMANDS = ['set', 'setex'];
export const REMOVE_COMMANDS = ['del', 'unlink'];
// todo: expire (no matching cache convention op yet)

/** Options controlling which redis commands are captured as cache spans. */
export interface RedisCacheOptions {
  /**
   * Define cache prefixes for cache keys that should be captured as a cache span.
   *
   * Setting this to, for example, `['user:']` will capture cache keys that start with `user:`.
   */
  cachePrefixes?: string[];
  /**
   * Maximum length of the cache key added to the span description. If the key exceeds this length, it will be truncated.
   *
   * Passing `0` will use the full cache key without truncation.
   *
   * By default, the full cache key is used.
   */
  maxCacheKeyLength?: number;
}

/** Checks if a given command is in the list of redis commands.
 *  Useful because commands can come in lowercase or uppercase (depending on the library). */
export function isInCommands(redisCommands: string[], command: string): boolean {
  return redisCommands.includes(command.toLowerCase());
}

/** Determine cache operation based on redis statement */
export function getCacheOperation(command: string): 'cache.get' | 'cache.put' | 'cache.remove' | undefined {
  if (isInCommands(GET_COMMANDS, command)) {
    return CACHE_GET;
  } else if (isInCommands(SET_COMMANDS, command)) {
    return CACHE_PUT;
  } else if (isInCommands(REMOVE_COMMANDS, command)) {
    return CACHE_REMOVE;
  } else {
    return undefined;
  }
}

function keyHasPrefix(key: string, prefixes: string[]): boolean {
  return prefixes.some(prefix => key.startsWith(prefix));
}

/** Safely converts a redis key to a string (comma-separated if there are multiple keys) */
export function getCacheKeySafely(redisCommand: string, cmdArgs: RedisCommandArgs): string[] | undefined {
  try {
    if (cmdArgs.length === 0) {
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processArg = (arg: string | Buffer | number | any[]): string[] => {
      if (typeof arg === 'string' || typeof arg === 'number' || Buffer.isBuffer(arg)) {
        return [arg.toString()];
      } else if (Array.isArray(arg)) {
        return flatten(arg.map(arg => processArg(arg)));
      } else {
        return ['<unknown>'];
      }
    };

    const firstArg = cmdArgs[0];
    if (isInCommands(SINGLE_ARG_COMMANDS, redisCommand) && firstArg != null) {
      return processArg(firstArg);
    }

    return flatten(cmdArgs.map(arg => processArg(arg)));
  } catch {
    return undefined;
  }
}

/** Determines whether a redis operation should be considered as "cache operation" by checking if a key is prefixed.
 *  We only support certain commands (such as 'set', 'get', 'mget'). */
export function shouldConsiderForCache(redisCommand: string, keys: string[], prefixes: string[]): boolean {
  if (!getCacheOperation(redisCommand)) {
    return false;
  }

  for (const key of keys) {
    if (keyHasPrefix(key, prefixes)) {
      return true;
    }
  }
  return false;
}

/** Calculates size based on the cache response value */
export function calculateCacheItemSize(response: unknown): number | undefined {
  const getSize = (value: unknown): number | undefined => {
    try {
      if (Buffer.isBuffer(value)) return value.byteLength;
      else if (typeof value === 'string') return value.length;
      else if (typeof value === 'number') return value.toString().length;
      else if (value === null || value === undefined) return 0;
      return JSON.stringify(value).length;
    } catch {
      return undefined;
    }
  };

  return Array.isArray(response)
    ? response.reduce((acc: number | undefined, curr) => {
        const size = getSize(curr);
        return typeof size === 'number' ? (acc !== undefined ? acc + size : size) : acc;
      }, 0)
    : getSize(response);
}

/**
 * Turns a redis command span into a cache span when its key matches one of the configured
 * `cachePrefixes`: sets the cache op, key, hit/miss and item-size attributes and renames the span
 * to the cache key. A no-op when no `cachePrefixes` are set or the command/key is not cache-relevant.
 *
 * Runs at command response time against the already-started db span, so it can read connection
 * attributes off the span and derive the item size from the response.
 */
export function applyRedisCacheAttributes(
  span: Span,
  redisCommand: string,
  cmdArgs: RedisCommandArgs,
  response: unknown,
  options: RedisCacheOptions,
): void {
  const safeKey = getCacheKeySafely(redisCommand, cmdArgs);
  const cacheOperation = getCacheOperation(redisCommand);

  if (
    !safeKey ||
    !cacheOperation ||
    !options.cachePrefixes ||
    !shouldConsiderForCache(redisCommand, safeKey, options.cachePrefixes)
  ) {
    // not relevant for cache
    return;
  }

  // otel/ioredis seems to be using the old standard, as there was a change to those params: https://github.com/open-telemetry/opentelemetry-specification/issues/3199
  // We are using params based on the docs: https://opentelemetry.io/docs/specs/semconv/attributes-registry/network/
  // Fall back to stable semconv attributes (server.address/server.port) when
  // old-semconv ones are absent, eg OTEL_SEMCONV_STABILITY_OPT_IN=database
  // set for node-redis v4/v5.
  const attributes = spanToJSON(span).attributes;
  // oxlint-disable-next-line typescript/no-deprecated
  const networkPeerAddress = (attributes[NET_PEER_NAME] ?? attributes[SERVER_ADDRESS]) as string | undefined;
  // oxlint-disable-next-line typescript/no-deprecated
  const networkPeerPort = (attributes[NET_PEER_PORT] ?? attributes[SERVER_PORT]) as number | undefined;

  if (networkPeerPort && networkPeerAddress) {
    span.setAttributes({ [NETWORK_PEER_ADDRESS]: networkPeerAddress, [NETWORK_PEER_PORT]: networkPeerPort });
  }

  // A remove response is a delete-count, not a cached value, so its size is meaningless.
  const cacheItemSize = isInCommands(REMOVE_COMMANDS, redisCommand) ? undefined : calculateCacheItemSize(response);

  if (cacheItemSize) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE, cacheItemSize);
  }

  if (isInCommands(GET_COMMANDS, redisCommand) && cacheItemSize !== undefined) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, cacheItemSize > 0);
  }

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: cacheOperation,
    [SEMANTIC_ATTRIBUTE_CACHE_KEY]: safeKey,
  });

  // todo: change to string[] once EAP supports it
  const spanDescription = safeKey.join(', ');

  span.updateName(options.maxCacheKeyLength ? truncate(spanDescription, options.maxCacheKeyLength) : spanDescription);
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, undefined);
}

type NestedArray<T> = Array<NestedArray<T> | T>;

function flatten<T>(input: NestedArray<T>): T[] {
  const result: T[] = [];

  const flattenHelper = (input: NestedArray<T>): void => {
    input.forEach((el: T | NestedArray<T>) => {
      if (Array.isArray(el)) {
        flattenHelper(el);
      } else {
        result.push(el);
      }
    });
  };

  flattenHelper(input);
  return result;
}
