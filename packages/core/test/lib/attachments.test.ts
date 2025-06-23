import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTransport } from '../../src/transports/base';
import { parseEnvelope } from '../../src/utils/envelope';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

describe('Attachments', () => {
  beforeEach(() => {
    TestClient.sendEventCalled = undefined;
    TestClient.instance = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('actually end up in envelope', async () => {
    expect.assertions(4);

    const options = getDefaultTestClientOptions({
      dsn: 'https://username@domain/123',
      enableSend: true,
      transport: () =>
        createTransport({ recordDroppedEvent: () => undefined }, async req => {
          const [, items] = parseEnvelope(req.body);
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
