import { expect } from 'chai';
import { fakeServer, SinonFakeServer, stub } from 'sinon';

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

let server: SinonFakeServer;
let transport: Transports.BaseTransport;

describe('XHRTransport', () => {
  beforeEach(() => {
    server = fakeServer.create();
    server.respondImmediately = true;
    transport = new Transports.XHRTransport({ dsn: testDsn });
  });

  afterEach(() => {
    server.restore();
  });

  it('inherits composeEndpointUrl() implementation', () => {
    // tslint:disable-next-line:deprecation
    expect(transport.url).equal(transportUrl);
  });

  describe('sendEvent()', async () => {
    it('sends a request to Sentry servers', async () => {
      server.respondWith('POST', transportUrl, [200, {}, '']);

      const res = await transport.sendEvent(payload);

      expect(res.status).equal(Status.Success);
      const request = server.requests[0];
      expect(server.requests.length).equal(1);
      expect(request.method).equal('POST');
      expect(JSON.parse(request.requestBody)).deep.equal(payload);
    });

    it('rejects with non-200 status code', async () => {
      server.respondWith('POST', transportUrl, [403, {}, '']);

      try {
        await transport.sendEvent(payload);
      } catch (res) {
        expect(res.status).equal(403);
        const request = server.requests[0];
        expect(server.requests.length).equal(1);
        expect(request.method).equal('POST');
        expect(JSON.parse(request.requestBody)).deep.equal(payload);
      }
    });

    it('back-off using Retry-After header', async () => {
      const retryAfterSeconds = 10;
      server.respondWith('POST', transportUrl, [429, { 'Retry-After': retryAfterSeconds }, '']);

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

    it('passes in headers', async () => {
      transport = new Transports.XHRTransport({
        dsn: testDsn,
        headers: {
          Authorization: 'Basic GVzdDp0ZXN0Cg==',
        },
      });

      server.respondWith('POST', transportUrl, [200, {}, '']);
      const res = await transport.sendEvent(payload);
      const request = server.requests[0];

      expect(res.status).equal(Status.Success);
      const requestHeaders: { [key: string]: string } = request.requestHeaders as { [key: string]: string };
      const authHeaderLabel: string = 'Authorization';
      expect(requestHeaders[authHeaderLabel]).equal('Basic GVzdDp0ZXN0Cg==');
    });
  });
});
