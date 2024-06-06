import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import {
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  defineIntegration,
  spanToJSON,
} from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';
import {
  GET_COMMANDS,
  calculateCacheItemSize,
  getCacheKeySafely,
  getCacheOperation,
  shouldConsiderForCache,
} from '../../utils/redisCache';

interface RedisOptions {
  cachePrefixes?: string[];
}

const INTEGRATION_NAME = 'Redis';

let _redisOptions: RedisOptions = {};

export const instrumentRedis = generateInstrumentOnce(INTEGRATION_NAME, () => {
  return new IORedisInstrumentation({
    responseHook: (span, redisCommand, cmdArgs, response) => {
      const safeKey = getCacheKeySafely(redisCommand, cmdArgs);

      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.redis');

      const cacheOperation = getCacheOperation(redisCommand);

      if (
        !safeKey ||
        !cacheOperation ||
        !_redisOptions?.cachePrefixes ||
        !shouldConsiderForCache(redisCommand, safeKey, _redisOptions.cachePrefixes)
      ) {
        // not relevant for cache
        return;
      }

      // otel/ioredis seems to be using the old standard, as there was a change to those params: https://github.com/open-telemetry/opentelemetry-specification/issues/3199
      // We are using params based on the docs: https://opentelemetry.io/docs/specs/semconv/attributes-registry/network/
      const networkPeerAddress = spanToJSON(span).data?.['net.peer.name'];
      const networkPeerPort = spanToJSON(span).data?.['net.peer.port'];
      if (networkPeerPort && networkPeerAddress) {
        span.setAttributes({ 'network.peer.address': networkPeerAddress, 'network.peer.port': networkPeerPort });
      }

      const cacheItemSize = calculateCacheItemSize(response);

      if (cacheItemSize) {
        span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE, cacheItemSize);
      }

      if (GET_COMMANDS.includes(redisCommand) && cacheItemSize !== undefined) {
        span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, cacheItemSize > 0);
      }

      span.setAttributes({
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: cacheOperation,
        [SEMANTIC_ATTRIBUTE_CACHE_KEY]: safeKey,
      });

      const spanDescription = safeKey.join(', ');

      span.updateName(spanDescription.length > 1024 ? `${spanDescription.substring(0, 1024)}...` : spanDescription);
    },
  });
});

const _redisIntegration = ((options: RedisOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      _redisOptions = options;
      instrumentRedis();

      // todo: implement them gradually
      // new LegacyRedisInstrumentation({}),
      // new RedisInstrumentation({}),
    },
  };
}) satisfies IntegrationFn;

/**
 * Redis integration for "ioredis"
 *
 * Capture tracing data for redis and ioredis.
 */
export const redisIntegration = defineIntegration(_redisIntegration);
