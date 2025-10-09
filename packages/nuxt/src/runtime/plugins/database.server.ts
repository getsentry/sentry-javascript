import {
  type SpanAttributes,
  captureException,
  debug,
  flushIfServerless,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startSpan,
} from '@sentry/core';
import type { Database } from 'db0';
// eslint-disable-next-line import/no-extraneous-dependencies
import { defineNitroPlugin, useDatabase } from 'nitropack/runtime';

/**
 * Creates a Nitro plugin that instruments the database calls.
 */
export default defineNitroPlugin(() => {
  const db = useDatabase();

  debug.log('@sentry/nuxt: Instrumenting database...');

  instrumentDatabase(db);

  debug.log('@sentry/nuxt: Database instrumented.');
});

function instrumentDatabase(db: Database): void {
  db.sql = new Proxy(db.sql, {
    apply(target, thisArg, args: Parameters<typeof db.sql>) {
      const query = args[0]?.[0];
      const attributes = getSpanAttributes(db, query);

      return startSpan(
        {
          name: query || 'db.query',
          attributes,
        },
        async span => {
          try {
            const result = await target.apply(thisArg, args);
            span.setStatus({ code: SPAN_STATUS_OK });

            return result;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureException(error, {
              mechanism: {
                handled: false,
                type: attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],
              },
            });

            // Re-throw the error to be handled by the caller
            throw error;
          } finally {
            await flushIfServerless();
          }
        },
      );
    },
  });
}

function getSpanAttributes(db: Database, query?: string): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.nuxt',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
    'db.system': db.dialect,
  };

  if (query) {
    attributes['db.query'] = query;
  }

  return attributes;
}
