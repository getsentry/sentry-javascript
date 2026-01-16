import type { BaseTransportOptions, Envelope, Event, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { describe, expect, test } from 'bun:test';
import type { NodeClient } from '../src/index';
import { init } from '../src/index';

const envelopes: Envelope[] = [];

function testTransport(_options: BaseTransportOptions): Transport {
  return {
    send(request: Envelope): Promise<TransportMakeRequestResponse> {
      envelopes.push(request);
      return Promise.resolve({ statusCode: 200 });
    },
    flush(): PromiseLike<boolean> {
      return new Promise(resolve => setTimeout(() => resolve(true), 100));
    },
  };
}

describe('Bun SDK', () => {
  const initOptions = {
    dsn: 'https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000',
    tracesSampleRate: 1,
    transport: testTransport,
  };

  test('SDK works as expected', async () => {
    let client: NodeClient | undefined;
    expect(() => {
      client = init(initOptions);
    }).not.toThrow();

    expect(client).not.toBeUndefined();

    client?.captureException(new Error('test'));
    client?.flush();

    await new Promise(resolve => setTimeout(resolve, 1000));

    const errorEnvelope = envelopes.find(envelope => envelope?.[1][0]?.[0]?.type === 'event');
    expect(errorEnvelope).toBeDefined();

    const event = errorEnvelope?.[1][0][1] as Event;

    expect(event.sdk?.name).toBe('sentry.javascript.bun');

    expect(event.exception?.values?.[0]?.type).toBe('Error');
    expect(event.exception?.values?.[0]?.value).toBe('test');
  });
});
