import { expect } from 'chai';
import { BaseTransport } from '../../src/transports/base';

const testDsn = 'https://123@sentry.io/42';

class SimpleTransport extends BaseTransport {}

describe('BaseTransport', () => {
  it('doesnt provide send() implementation', async () => {
    const transport = new SimpleTransport({ dsn: testDsn });

    try {
      await transport.send({});
    } catch (e) {
      expect(e.message).equal('Transport Class has to implement `send` method');
    }
  });

  it('has correct endpoint url', () => {
    const transport = new SimpleTransport({ dsn: testDsn });
    expect(transport.url).equal('https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7');
  });
});
