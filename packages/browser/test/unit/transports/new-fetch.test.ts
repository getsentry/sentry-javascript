// eslint-disable-next-line no-var
declare var window: any;

describe('NewFetchTransport', () => {
  beforeEach(() => {
    window.fetch = fetch;
    window.Headers = class Headers {
      headers: { [key: string]: string } = {};
      get(key: string) {
        return this.headers[key];
      }
      set(key: string, value: string) {
        this.headers[key] = value;
      }
    };
    transport = new Transports.FetchTransport({ dsn: testDsn }, window.fetch);
  });
});
