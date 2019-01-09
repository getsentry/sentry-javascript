import { expect } from 'chai';
import { SinonStub, stub } from 'sinon';
import { Status, Transports } from '../../src';

const testDsn = 'https://123@sentry.io/42';
const transportUrl = 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7';
const payload = {
  event_id: '1337',
  message: 'Pickle Rick',
  user: {
    username: 'Morty',
  },
};

let fetch: SinonStub;
let transport: Transports.BaseTransport;

describe('FetchTransport', () => {
  beforeEach(() => {
    fetch = stub(window, 'fetch');
    transport = new Transports.FetchTransport({ dsn: testDsn });
  });

  afterEach(() => {
    fetch.restore();
  });

  it('inherits composeEndpointUrl() implementation', () => {
    expect(transport.url).equal(transportUrl);
  });

  describe('sendEvent()', async () => {
    it('sends a request to Sentry servers', async () => {
      const response = { status: 200 };

      fetch.returns(Promise.resolve(response));

      return transport.sendEvent(JSON.stringify(payload)).then(res => {
        expect(res.status).equal(Status.Success);
        expect(fetch.calledOnce).equal(true);
        expect(
          fetch.calledWith(transportUrl, {
            body: JSON.stringify(payload),
            method: 'POST',
            referrerPolicy: 'origin',
          }),
        ).equal(true);
      });
    });

    it('rejects with non-200 status code', async () => {
      const response = { status: 403 };

      fetch.returns(Promise.reject(response));

      return transport.sendEvent(JSON.stringify(payload)).catch(res => {
        expect(res.status).equal(403);
        expect(fetch.calledOnce).equal(true);
        expect(
          fetch.calledWith(transportUrl, {
            body: JSON.stringify(payload),
            method: 'POST',
            referrerPolicy: 'origin',
          }),
        ).equal(true);
      });
    });
  });
});
