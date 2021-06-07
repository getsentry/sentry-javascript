import { SentryError } from '@sentry/utils';

import { ForgeRuntimeTransport } from '../../src/transports/forge';

const dsn = 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622';
const silenceErrors = () => null;

describe('ForgeRuntimeTransport', () => {
  test('calls Forge runtime API fetch()', async () => {
    const requestSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    const transport = new ForgeRuntimeTransport({ dsn, fetch: requestSpy, logError: silenceErrors });
    await transport.sendEvent({});
    expect(requestSpy).toHaveBeenCalled();
  });

  test('rejects if Forge runtime API fetch() rejects', () => {
    const requestSpy = jest.fn().mockRejectedValue(new Error('Fetch error to console.error'));
    const transport = new ForgeRuntimeTransport({ dsn, fetch: requestSpy, logError: silenceErrors });

    return expect(transport.sendEvent({})).rejects.toEqual(new SentryError('HTTP Error (500)'));
  });

  test('rejects if API response is not ok', () => {
    const requestSpy = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });
    const transport = new ForgeRuntimeTransport({ dsn, fetch: requestSpy, logError: silenceErrors });
    return expect(transport.sendEvent({})).rejects.toEqual(new SentryError('HTTP Error (400)'));
  });
});
