import { DSNComponents } from '@sentry/types';
import { expect } from 'chai';
import { BaseTransport } from '../../src/transports/base';

const testDSN = 'https://123@sentry.io/42';

class SimpleTransport extends BaseTransport {}
// tslint:disable-next-line:max-classes-per-file
class ComplexTransport extends BaseTransport {
  public composeUrl(dsn: DSNComponents): string {
    return `https://${dsn.host}/${dsn.user}`;
  }
}

describe('BaseTransport', () => {
  it('doesnt provide send() implementation', async () => {
    const transport = new SimpleTransport({ dsn: testDSN });

    try {
      await transport.send({});
    } catch (e) {
      expect(e.message).equal('Transport Class has to implement `send` method');
    }
  });

  it('provides composeEndpointUrl() implementation', () => {
    const transport = new SimpleTransport({ dsn: testDSN });
    expect(transport.url).equal(
      'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7',
    );
  });

  it('allows overriding composeEndpointUrl() implementation', () => {
    const transport = new ComplexTransport({ dsn: testDSN });
    expect(transport.url).equal('https://sentry.io/123');
  });
});
