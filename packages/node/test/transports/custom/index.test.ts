import { CustomUrlTransport } from './transports';

describe('Custom transport', () => {
  describe('URL parser support', () => {
    const noop = () => null;
    const sampleDsn = 'https://username@sentry.tld/path/1';

    test('use URL parser for sendEvent() method', async () => {
      const urlParser = jest.fn();
      const transport = new CustomUrlTransport({ dsn: sampleDsn }, urlParser);
      await transport.sendEvent({}).catch(noop);

      expect(urlParser).toHaveBeenCalled();
    });

    test('use URL parser for sendSession() method', async () => {
      const urlParser = jest.fn();
      const transport = new CustomUrlTransport({ dsn: sampleDsn }, urlParser);
      await transport.sendSession({ aggregates: [] }).then(noop, noop);

      expect(urlParser).toHaveBeenCalled();
    });
  });
});
