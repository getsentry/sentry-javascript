import {
  CACHE_OPERATION,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  CACHE_OPERATION_NAMES,
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
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
   *
   * Only applies with `traceLifecycle: 'static'`. With span streaming (the default), span names are
   * low cardinality: cache spans are named after the cache operation (e.g. `cache.get`) and the
   * key is only added to the `cache.key` attribute, so there is nothing to truncate.
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
 * Decides at span-start time whether a redis command is a cache operation (its key matches one of
 * the configured `cachePrefixes`) and returns the span name plus attribute overrides to merge into
 * the db span options, or `undefined` for a plain db span. Callers must spread the returned
 * attributes after their db attributes, so the cache op overrides the db op. Deciding at start time
 * — instead of renaming the db span at response time — makes `ignoreSpans` and span streaming see
 * the same op/name the user sees in the UI.
 *
 * `dbAttributes` are the attributes the caller starts the span with; the network peer is derived
 * from `server.address`/`server.port` in there.
 */
export function getRedisCacheAttributes(
  redisCommand: string,
  cmdArgs: RedisCommandArgs,
  dbAttributes: SpanAttributes,
  options: RedisCacheOptions,
): { name: string; attributes: SpanAttributes } | undefined {
  const safeKey = getCacheKeySafely(redisCommand, cmdArgs);
  const cacheOperation = getCacheOperation(redisCommand);

  if (
    !safeKey ||
    !cacheOperation ||
    !options.cachePrefixes ||
    !shouldConsiderForCache(redisCommand, safeKey, options.cachePrefixes)
  ) {
    // not relevant for cache
    return undefined;
  }

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: cacheOperation,
    [SEMANTIC_ATTRIBUTE_CACHE_KEY]: safeKey,
    [CACHE_OPERATION]: CACHE_OPERATION_NAMES[cacheOperation],
  };

  const networkPeerAddress = dbAttributes[SERVER_ADDRESS] as string | undefined;
  const networkPeerPort = dbAttributes[SERVER_PORT] as number | undefined;
  if (networkPeerPort && networkPeerAddress) {
    attributes[NETWORK_PEER_ADDRESS] = networkPeerAddress;
    attributes[NETWORK_PEER_PORT] = networkPeerPort;
  }

  const client = getClient();
  if (client && hasSpanStreamingEnabled(client)) {
    // With span streaming, span names have to be low cardinality, so we can't fall back to the cache key.
    return { name: cacheOperation, attributes };
  }

  // todo: change to string[] once EAP supports it
  const spanDescription = safeKey.join(', ');

  return {
    name: options.maxCacheKeyLength ? truncate(spanDescription, options.maxCacheKeyLength) : spanDescription,
    attributes,
  };
}

/**
 * Sets the response-derived cache attributes (`cache.hit`, `cache.item_size`) on a span that was
 * started as a cache span via {@link getRedisCacheAttributes}. A no-op for plain db spans and for
 * `cache.remove` spans — a remove response is a delete-count, not a cached value, so its size is
 * meaningless.
 */
export function applyCacheResponseAttributes(span: Span, response: unknown): void {
  const op = spanToJSON(span).attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP];
  if (op !== CACHE_GET && op !== CACHE_PUT) {
    return;
  }

  const cacheItemSize = calculateCacheItemSize(response);

  if (cacheItemSize) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE, cacheItemSize);
  }

  if (op === CACHE_GET && cacheItemSize !== undefined) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, cacheItemSize > 0);
  }
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
