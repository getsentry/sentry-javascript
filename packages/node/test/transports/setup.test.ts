import { NoopTransport } from '@sentry/core';
import { FakeTransport } from '@sentry/core/test/mocks/transport';
import { HTTPSTransport, HTTPTransport, setupNodeTransport } from '@sentry/node/src/transports';

const DSN = 'https://username@domain/123';

describe('setupNodeTransport', () => {
  it('returns NoopTransport if no dsn is passed', () => {
    const { transport, newTransport } = setupNodeTransport({});

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(NoopTransport);
    expect(newTransport).toBeUndefined();
  });

  it('returns the instantiated transport passed via the options', () => {
    const options = { dsn: DSN, transport: FakeTransport };
    const { transport, newTransport } = setupNodeTransport(options);

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(FakeTransport);
    expect(newTransport).toBeUndefined();
  });

  it('returns HTTPS transport as a default', () => {
    const options = { dsn: DSN };
    const { transport, newTransport } = setupNodeTransport(options);

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(HTTPSTransport);
    expect(newTransport).toBeDefined();
  });

  it('returns HTTP transport if specified in the dsn', () => {
    // fetchSupported = false;

    const options = { dsn: 'http://username@domain/123' };
    const { transport, newTransport } = setupNodeTransport(options);

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(HTTPTransport);
    expect(newTransport).toBeDefined();
  });
});
