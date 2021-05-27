import { SentryError } from '@sentry/utils';

import { CustomUrlTransport, NoUrlTransport } from './transports';

describe('Custom transport', () => {
  describe('url container support', () => {
    const noop = () => null;
    const sampleDsn = 'https://username@sentry.tld/path/1';

    test("reject with SentryError when a transport doesn't define a URL container", () => {
      const transport = new NoUrlTransport({
        dsn: sampleDsn,
      });

      return expect(transport.sendEvent({})).rejects.toEqual(new SentryError('No URL configured'));
    });

    test('use URL property constructor for sendEvent() method', async () => {
      const mockUrlConstructor = jest.fn();

      const transport = new CustomUrlTransport(
        {
          dsn: sampleDsn,
        },
        {
          URL: mockUrlConstructor,
        },
      );

      await transport.sendEvent({}).catch(noop);
      expect(mockUrlConstructor).toHaveBeenCalled();
    });

    test('use URL property constructor for sendSession() method', async () => {
      const mockUrlConstructor = jest.fn();

      const transport = new CustomUrlTransport(
        {
          dsn: sampleDsn,
        },
        {
          URL: mockUrlConstructor,
        },
      );

      await transport.sendSession({ aggregates: [] }).then(noop, noop);
      expect(mockUrlConstructor).toHaveBeenCalled();
    });
  });
});
