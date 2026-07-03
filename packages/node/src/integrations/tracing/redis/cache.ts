import type { Span } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  spanToJSON,
  truncate,
} from '@sentry/core';
import type { IORedisCommandArgs } from '../../../utils/redisCache';
import {
  calculateCacheItemSize,
  GET_COMMANDS,
  getCacheKeySafely,
  getCacheOperation,
  isInCommands,
  shouldConsiderForCache,
} from '../../../utils/redisCache';
import type { IORedisResponseCustomAttributeFunction } from './vendored/types';

// This module deliberately does NOT import the vendored OTel `IORedisInstrumentation`/
// `RedisInstrumentation`, so the orchestrion opt-in can pull `cacheResponseHook`
// without dragging the OTel redis instrumentation into its module graph.

export interface RedisOptions {
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

/* Only exported for testing purposes */
export let _redisOptions: RedisOptions = {};

/** Set the options consumed by {@link cacheResponseHook}. */
export function setRedisOptions(options: RedisOptions): void {
  _redisOptions = options;
}

/* Only exported for testing purposes */
export const cacheResponseHook: IORedisResponseCustomAttributeFunction = (
  span: Span,
  redisCommand: string,
  cmdArgs: IORedisCommandArgs,
  response: unknown,
) => {
  const safeKey = getCacheKeySafely(redisCommand, cmdArgs);
  const cacheOperation = getCacheOperation(redisCommand);

  if (
    !safeKey ||
    !cacheOperation ||
    !_redisOptions.cachePrefixes ||
    !shouldConsiderForCache(redisCommand, safeKey, _redisOptions.cachePrefixes)
  ) {
    // not relevant for cache
    return;
  }

  // otel/ioredis seems to be using the old standard, as there was a change to those params: https://github.com/open-telemetry/opentelemetry-specification/issues/3199
  // We are using params based on the docs: https://opentelemetry.io/docs/specs/semconv/attributes-registry/network/
  // Fall back to stable semconv attributes (server.address/server.port) when
  // old-semconv ones are absent, eg OTEL_SEMCONV_STABILITY_OPT_IN=database
  // set for node-redis v4/v5.
  const spanData = spanToJSON(span).data;
  const networkPeerAddress = spanData['net.peer.name'] ?? spanData['server.address'];
  const networkPeerPort = spanData['net.peer.port'] ?? spanData['server.port'];
  if (networkPeerPort && networkPeerAddress) {
    span.setAttributes({ 'network.peer.address': networkPeerAddress, 'network.peer.port': networkPeerPort });
  }

  const cacheItemSize = calculateCacheItemSize(response);

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

  span.updateName(
    _redisOptions.maxCacheKeyLength ? truncate(spanDescription, _redisOptions.maxCacheKeyLength) : spanDescription,
  );
};
