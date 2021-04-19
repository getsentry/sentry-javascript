import { Session } from '@sentry/hub';

import { BaseTransport } from '../../src/transports/base';

const testDsn = 'https://123@sentry.io/42';

class SimpleTransport extends BaseTransport {}

describe('BaseTransport', () => {
  test('doesnt provide sendEvent() implementation', async () => {
    const transport = new SimpleTransport({ dsn: testDsn });

    try {
      await transport.sendEvent({});
    } catch (e) {
      expect(e.message).toEqual('Transport Class has to implement `sendEvent` method.');
    }
  });

  test('doesnt provide sendSession() implementation', async () => {
    const transport = new SimpleTransport({ dsn: testDsn });

    try {
      await transport.sendSession(new Session());
    } catch (e) {
      expect(e.message).toEqual('Transport Class has to implement `sendSession` method.');
    }
  });

  test('doesnt provide sendSessionAggregate() implementation', async () => {
    const transport = new SimpleTransport({ dsn: testDsn });

    try {
      await transport.sendSessionAggregate({});
    } catch (e) {
      expect(e.message).toEqual('Transport Class has to implement `sendSessionAggregate` method.');
    }
  });
});
