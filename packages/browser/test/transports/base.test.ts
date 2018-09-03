import { expect } from 'chai';
import { BaseTransport } from '../../src/transports/base';

const testDsn = 'https://123@sentry.io/42';

class SimpleTransport extends BaseTransport {}

describe('BaseTransport', () => {
  it('doesnt provide captureEvent() implementation', async () => {
    const transport = new SimpleTransport({ dsn: testDsn });

    try {
      await transport.captureEvent({});
    } catch (e) {
      expect(e.message).equal('Transport Class has to implement `captureEvent` method');
    }
  });

  it('has correct endpoint url', () => {
    const transport = new SimpleTransport({ dsn: testDsn });
    expect(transport.url).equal('https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7');
  });
});
