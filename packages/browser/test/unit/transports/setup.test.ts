import { NoopTransport } from '@sentry/core';

import {
  FetchTransport,
  makeNewFetchTransport,
  makeNewXHRTransport,
  setupBrowserTransport,
  XHRTransport,
} from '../../../src/transports';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';
import { SimpleTransport } from '../mocks/simpletransport';

const DSN = 'https://username@domain/123';

let fetchSupported = true;

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

jest.mock('../../../src/transports/new-fetch', () => {
  const original = jest.requireActual('../../../src/transports/new-fetch');
  return {
    ...original,
    makeNewFetchTransport: jest.fn(() => ({
      send: () => Promise.resolve({ status: 'success' }),
      flush: () => Promise.resolve(true),
    })),
  };
});

jest.mock('../../../src/transports/new-xhr', () => {
  const original = jest.requireActual('../../../src/transports/new-xhr');
  return {
    ...original,
    makeNewXHRTransport: jest.fn(() => ({
      send: () => Promise.resolve({ status: 'success' }),
      flush: () => Promise.resolve(true),
    })),
  };
});

describe('setupBrowserTransport', () => {
  afterEach(() => jest.clearAllMocks());

  afterAll(() => jest.resetAllMocks());

  it('returns NoopTransport if no dsn is passed', () => {
    const { transport, newTransport } = setupBrowserTransport({});

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(NoopTransport);
    expect(newTransport).toBeUndefined();
  });

  it('returns the instantiated transport passed via the options', () => {
    const options = getDefaultBrowserClientOptions({ dsn: DSN, transport: SimpleTransport });
    const { transport, newTransport } = setupBrowserTransport(options);

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(SimpleTransport);
    expect(newTransport).toBeUndefined();
  });

  it('returns fetchTransports if fetch is supported', () => {
    const options = getDefaultBrowserClientOptions({ dsn: DSN });
    delete options.transport;
    const { transport, newTransport } = setupBrowserTransport(options);

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(FetchTransport);
    expect(newTransport).toBeDefined();
    expect(makeNewFetchTransport).toHaveBeenCalledTimes(1);
    expect(makeNewXHRTransport).toHaveBeenCalledTimes(0);
  });

  it('returns xhrTransports if fetch is not supported', () => {
    fetchSupported = false;

    const options = getDefaultBrowserClientOptions({ dsn: DSN });
    delete options.transport;
    const { transport, newTransport } = setupBrowserTransport(options);

    expect(transport).toBeDefined();
    expect(transport).toBeInstanceOf(XHRTransport);
    expect(newTransport).toBeDefined();
    expect(makeNewFetchTransport).toHaveBeenCalledTimes(0);
    expect(makeNewXHRTransport).toHaveBeenCalledTimes(1);
  });
});
