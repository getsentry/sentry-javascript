import { expect } from 'chai';
import { SinonStub, stub } from 'sinon';

import { Status, Transports } from '../../../src';

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
    // @ts-ignore
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

      const res = await transport.sendEvent(payload);

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

    it('rejects with non-200 status code', async () => {
      const response = { status: 403 };

      fetch.returns(Promise.resolve(response));

      try {
        await transport.sendEvent(payload);
      } catch (res) {
        expect(res.status).equal(403);
        expect(fetch.calledOnce).equal(true);
        expect(
          fetch.calledWith(transportUrl, {
            body: JSON.stringify(payload),
            method: 'POST',
            referrerPolicy: 'origin',
          }),
        ).equal(true);
      }
    });

    it('pass the error to rejection when fetch fails', async () => {
      const response = { status: 403 };

      fetch.returns(Promise.reject(response));

      try {
        await transport.sendEvent(payload);
      } catch (res) {
        expect(res).equal(response);
      }
    });

    it('back-off using Retry-After header', async () => {
      const retryAfterSeconds = 10;
      const headers = new Map();
      headers.set('Retry-After', retryAfterSeconds);
      const response = { status: 429, headers };
      fetch.returns(Promise.resolve(response));

      const now = Date.now();
      const dateStub = stub(Date, 'now')
        // Check for first event
        .onCall(0)
        .returns(now)
        // Setting disableUntil
        .onCall(1)
        .returns(now)
        // Check for second event
        .onCall(2)
        .returns(now + (retryAfterSeconds / 2) * 1000)
        // Check for third event
        .onCall(3)
        .returns(now + retryAfterSeconds * 1000);

      try {
        await transport.sendEvent(payload);
      } catch (res) {
        expect(res.status).equal(429);
        expect(res.reason).equal(undefined);
      }

      try {
        await transport.sendEvent(payload);
      } catch (res) {
        expect(res.status).equal(429);
        expect(res.reason).equal(
          `Transport locked till ${new Date(now + retryAfterSeconds * 1000)} due to too many requests.`,
        );
      }

      try {
        await transport.sendEvent(payload);
      } catch (res) {
        expect(res.status).equal(429);
        expect(res.reason).equal(undefined);
      }

      dateStub.restore();
    });
  });
});
