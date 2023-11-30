import { TextDecoder, TextEncoder } from 'util';
import { parseEnvelope } from '@sentry/utils';

import { createTransport } from '../../src/transports/base';
import { TestClient, getDefaultTestClientOptions } from '../mocks/client';

describe('Attachments', () => {
  beforeEach(() => {
    TestClient.sendEventCalled = undefined;
    TestClient.instance = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('actually end up in envelope', async () => {
    expect.assertions(4);

    const options = getDefaultTestClientOptions({
      dsn: 'https://username@domain/123',
      enableSend: true,
      transport: () =>
        createTransport({ recordDroppedEvent: () => undefined, textEncoder: new TextEncoder() }, async req => {
          const [, items] = parseEnvelope(req.body, new TextEncoder(), new TextDecoder());
          expect(items.length).toEqual(2);
          // Second envelope item should be the attachment
          expect(items[1][0]).toEqual({ type: 'attachment', length: 50000, filename: 'empty.bin' });
          expect(items[1][1]).toBeInstanceOf(Uint8Array);
          expect((items[1][1] as Uint8Array).length).toEqual(50_000);
          return {};
        }),
    });

    const client = new TestClient(options);
    client.captureEvent({}, { attachments: [{ filename: 'empty.bin', data: new Uint8Array(50_000) }] });
  });
});
