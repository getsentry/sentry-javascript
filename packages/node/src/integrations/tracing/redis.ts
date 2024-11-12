import type { Span } from '@opentelemetry/api';
import type { RedisResponseCustomAttributeFunction } from '@opentelemetry/instrumentation-ioredis';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
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
import { truncate } from '@sentry/utils';
import { generateInstrumentOnce } from '../../otel/instrument';
import {
  GET_COMMANDS,
  calculateCacheItemSize,
  getCacheKeySafely,
  getCacheOperation,
  isInCommands,
  shouldConsiderForCache,
} from '../../utils/redisCache';

interface RedisOptions {
  cachePrefixes?: string[];
}

const INTEGRATION_NAME = 'Redis';

let _redisOptions: RedisOptions = {};

const cacheResponseHook: RedisResponseCustomAttributeFunction = (span: Span, redisCommand, cmdArgs, response) => {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.redis');

  const safeKey = getCacheKeySafely(redisCommand, cmdArgs);
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

  if (isInCommands(GET_COMMANDS, redisCommand) && cacheItemSize !== undefined) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, cacheItemSize > 0);
  }

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: cacheOperation,
    [SEMANTIC_ATTRIBUTE_CACHE_KEY]: safeKey,
  });

  const spanDescription = safeKey.join(', ');

  span.updateName(truncate(spanDescription, 1024));
};

const instrumentIORedis = generateInstrumentOnce('IORedis', () => {
  return new IORedisInstrumentation({
    responseHook: cacheResponseHook,
  });
});

const instrumentRedis4 = generateInstrumentOnce('Redis-4', () => {
  return new RedisInstrumentation({
    responseHook: cacheResponseHook,
  });
});

/** To be able to preload all Redis OTel instrumentations with just one ID ("Redis"), all the instrumentations are generated in this one function  */
export const instrumentRedis = Object.assign(
  (): void => {
    instrumentIORedis();
    instrumentRedis4();

    // todo: implement them gradually
    // new LegacyRedisInstrumentation({}),
  },
  { id: INTEGRATION_NAME },
);

const _redisIntegration = ((options: RedisOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      _redisOptions = options;
      instrumentRedis();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [redis](https://www.npmjs.com/package/redis) and
 * [ioredis](https://www.npmjs.com/package/ioredis) libraries.
 *
 * For more information, see the [`redisIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/redis/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.redisIntegration()],
 * });
 * ```
 */
export const redisIntegration = defineIntegration(_redisIntegration);
