import { DB_QUERY_TEXT } from '@sentry/conventions/attributes';
import { getCurrentScope, setCurrentClient, startSpan } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getV3SpanAttributes, getV4SpanAttributes } from '../../src/integrations/mongodb/mongodb-span';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const ORIGIN = 'auto.db.mongo';
const NAMESPACE = { db: 'app', collection: 'users' };
const CONNECTION = { address: 'localhost:27017' };
const UPDATE_COMMAND = {
  update: 'users',
  updates: [{ q: { _id: 'abc' }, u: { $set: { profile: { name: 'Jane', tags: ['a', 'b'] } } } }],
};
const SCRUBBED_UPDATE_COMMAND =
  '{"update":"?","updates":[{"q":{"_id":"?"},"u":{"$set":{"profile":{"name":"?","tags":["?","?"]}}}}]}';

function initClient(tracesSampleRate: number | undefined): void {
  const client = new TestClient(getDefaultTestClientOptions({ dsn: 'https://key@sentry.io/1', tracesSampleRate }));
  setCurrentClient(client);
  client.init();
}

describe('mongodb span attributes', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('adds the scrubbed statement when the parent span is sampled', () => {
    initClient(1.0);

    const attributes = startSpan({ name: 'parent' }, () =>
      getV4SpanAttributes(CONNECTION, NAMESPACE, UPDATE_COMMAND, 'update', ORIGIN),
    );

    expect(attributes[DB_QUERY_TEXT]).toBe(SCRUBBED_UPDATE_COMMAND);
  });

  it('adds the scrubbed statement for a v3 command when the parent span is sampled', () => {
    initClient(1.0);

    const attributes = startSpan({ name: 'parent' }, () =>
      getV3SpanAttributes(
        'app.users',
        undefined,
        { q: { _id: 'abc' }, u: { $set: { name: 'Jane' } } },
        'update',
        ORIGIN,
      ),
    );

    expect(attributes[DB_QUERY_TEXT]).toBe('{"_id":"?"}');
  });

  it('does not serialize the command when there is no parent span', () => {
    initClient(1.0);

    const attributes = getV4SpanAttributes(CONNECTION, NAMESPACE, UPDATE_COMMAND, 'update', ORIGIN);

    expect(attributes).not.toHaveProperty(DB_QUERY_TEXT);
  });

  it.each([
    ['tracesSampleRate is 0', 0],
    ['tracesSampleRate is not set', undefined],
  ])('does not serialize the command when %s', (_, tracesSampleRate) => {
    initClient(tracesSampleRate);

    const attributes = startSpan({ name: 'parent' }, () =>
      getV4SpanAttributes(CONNECTION, NAMESPACE, UPDATE_COMMAND, 'update', ORIGIN),
    );

    expect(attributes).not.toHaveProperty(DB_QUERY_TEXT);
  });
});
