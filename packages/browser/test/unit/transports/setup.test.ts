import { NoopTransport } from '@sentry/core';

import { FetchTransport, setupBrowserTransport, XHRTransport } from '../../../src/transports';
import { SimpleTransport } from '../mocks/simpletransport';

const DSN = 'https://username@domain/123';

let fetchSupported = true;
let getNativeFetchImplCalled = false;

jest.mock('@sentry/utils', () => {
  const original = jest.requireActual('@sentry/utils');
  return {
    ...original,
    supportsFetch(): boolean {
      return fetchSupported;
    },
    getGlobalObject(): any {
      return {
        fetch: () => {},
      };
    },
  };
});

jest.mock('@sentry/browser/src/transports/utils', () => {
  const original = jest.requireActual('@sentry/browser/src/transports/utils');
  return {
    ...original,
    getNativeFetchImplementation() {
      getNativeFetchImplCalled = true;
      return {
        fetch: () => {},
      };
    },
  };
});

describe('setupBrowserTransport', () => {
  beforeEach(() => {
    getNativeFetchImplCalled = false;
  });

  it('returns NoopTransport if no dsn is passed', () => {
    const { transport, newTransport } = setupBrowserTransport({});

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(NoopTransport);
    expect(newTransport).toBeUndefined();
  });

  it('returns the instantiated transport passed via the options', () => {
    const options = { dsn: DSN, transport: SimpleTransport };
    const { transport, newTransport } = setupBrowserTransport(options);

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(SimpleTransport);
    expect(newTransport).toBeUndefined();
  });

  it('returns fetchTransports if fetch is supported', () => {
    const options = { dsn: DSN };
    const { transport, newTransport } = setupBrowserTransport(options);

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(FetchTransport);
    expect(newTransport).toBeDefined();
    // This is a weird way of testing that `newTransport` is using fetch but it works.
    // Given that the new transports are functions, we cannot test their instance.
    // Totally open for suggestions how to test this better here
    expect(getNativeFetchImplCalled).toBe(true);
  });

  it('returns xhrTransports if fetch is not supported', () => {
    fetchSupported = false;

    const options = { dsn: DSN };
    const { transport, newTransport } = setupBrowserTransport(options);

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(XHRTransport);
    expect(newTransport).toBeDefined();
    // This is a weird way of testing that `newTransport` is using fetch but it works.
    // Given that the new transports are functions, we cannot test their instance.
    // Totally open for suggestions how to test this better here
    expect(getNativeFetchImplCalled).toBe(false);
  });
});
