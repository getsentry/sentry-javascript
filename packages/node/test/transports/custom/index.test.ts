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

      return expect(transport.sendEvent({})).rejects.toEqual(new SentryError('No URL parser configured'));
    });

    test('use URL property constructor for sendEvent() method', async () => {
      const urlParser = jest.fn();
      const transport = new CustomUrlTransport({ dsn: sampleDsn }, urlParser);
      await transport.sendEvent({}).catch(noop);

      expect(urlParser).toHaveBeenCalled();
    });

    test('use URL property constructor for sendSession() method', async () => {
      const urlParser = jest.fn();
      const transport = new CustomUrlTransport({ dsn: sampleDsn }, urlParser);
      await transport.sendSession({ aggregates: [] }).then(noop, noop);

      expect(urlParser).toHaveBeenCalled();
    });
  });
});
