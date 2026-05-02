import type { BaseTransportOptions, Envelope, Event, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { BunLightClient } from '../src/light/index';
import { init, makeFetchTransport } from '../src/light/index';

let envelopes: Envelope[] = [];

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

describe('Bun Light SDK', () => {
  const initOptions = {
    dsn: 'https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000',
    tracesSampleRate: 1,
    transport: testTransport,
  };

  beforeEach(() => {
    envelopes = [];
  });

  afterEach(() => {
    envelopes = [];
  });

  test('SDK works as expected', async () => {
    let client: BunLightClient | undefined;
    expect(() => {
      client = init(initOptions);
    }).not.toThrow();

    expect(client).not.toBeUndefined();

    client?.captureException(new Error('test'));
    await client?.flush();

    const errorEnvelope = envelopes.find(envelope => envelope?.[1][0]?.[0]?.type === 'event');
    expect(errorEnvelope).toBeDefined();

    const event = errorEnvelope?.[1][0][1] as Event;

    expect(event.sdk?.name).toBe('sentry.javascript.bun');

    expect(event.exception?.values?.[0]?.type).toBe('Error');
    expect(event.exception?.values?.[0]?.value).toBe('test');
  });

  test('SDK sets bun runtime metadata', () => {
    const client = init(initOptions);

    expect(client).not.toBeUndefined();

    const options = client?.getOptions();
    expect(options?.runtime?.name).toBe('bun');
  });

  test('SDK uses makeFetchTransport by default', () => {
    const client = init({ dsn: initOptions.dsn });

    expect(client).not.toBeUndefined();

    const options = client?.getOptions();
    expect(options?.transport).toBe(makeFetchTransport);
  });
});
