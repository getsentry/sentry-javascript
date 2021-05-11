import { expect } from 'chai';
import { fakeServer, SinonFakeServer, stub } from 'sinon';

import { Event, Status, Transports } from '../../../src';

const testDsn = 'https://123@sentry.io/42';
const storeUrl = 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7';
const envelopeUrl = 'https://sentry.io/api/42/envelope/?sentry_key=123&sentry_version=7';
const envelopeTunnel = 'https://hello.com/world';
const eventPayload: Event = {
  event_id: '1337',
};
const transactionPayload: Event = {
  event_id: '42',
  type: 'transaction',
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
    // eslint-disable-next-line deprecation/deprecation
    expect(transport.url).equal(storeUrl);
  });

  describe('sendEvent()', async () => {
    it('sends a request to Sentry servers', async () => {
      server.respondWith('POST', storeUrl, [200, {}, '']);

      const res = await transport.sendEvent(eventPayload);

      expect(res.status).equal(Status.Success);
      const request = server.requests[0];
      expect(server.requests.length).equal(1);
      expect(request.method).equal('POST');
      expect(JSON.parse(request.requestBody)).deep.equal(eventPayload);
    });

    it('sends a request to envelopeTunnel if configured', async () => {
      transport = new Transports.XHRTransport({ dsn: testDsn, envelopeTunnel });
      server.respondWith('POST', envelopeTunnel, [200, {}, '']);

      await transport.sendEvent(eventPayload);

      expect(server.requests[0].url).equal(envelopeTunnel);
    });

    it('rejects with non-200 status code', async () => {
      server.respondWith('POST', storeUrl, [403, {}, '']);

      try {
        await transport.sendEvent(eventPayload);
      } catch (res) {
        expect(res.status).equal(403);
        const request = server.requests[0];
        expect(server.requests.length).equal(1);
        expect(request.method).equal('POST');
        expect(JSON.parse(request.requestBody)).deep.equal(eventPayload);
      }
    });

    it('passes in headers', async () => {
      transport = new Transports.XHRTransport({
        dsn: testDsn,
        headers: {
          Accept: 'application/json',
        },
      });

      server.respondWith('POST', storeUrl, [200, {}, '']);
      const res = await transport.sendEvent(eventPayload);
      const request = server.requests[0];

      expect(res.status).equal(Status.Success);
      const requestHeaders: { [key: string]: string } = request.requestHeaders as { [key: string]: string };
      expect(requestHeaders['Accept']).equal('application/json');
    });

    describe('Rate-limiting', () => {
      it('back-off using Retry-After header', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [429, { 'Retry-After': `${retryAfterSeconds}` }, '']);

        const dateStub = stub(Date, 'now')
          // 1st event - _isRateLimited - false
          .onCall(0)
          .returns(beforeLimit)
          // 1st event - _handleRateLimit
          .onCall(1)
          .returns(beforeLimit)
          // 2nd event - _isRateLimited - true
          .onCall(2)
          .returns(withinLimit)
          // 3rd event - _isRateLimited - false
          .onCall(3)
          .returns(afterLimit)
          // 3rd event - _handleRateLimit
          .onCall(4)
          .returns(afterLimit);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(undefined);
          expect(server.requests.length).equal(1);
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(server.requests.length).equal(1);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(server.requests.length).equal(2);

        dateStub.restore();
      });

      it('back-off using X-Sentry-Rate-Limits with single category', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [429, { 'X-Sentry-Rate-Limits': `${retryAfterSeconds}:error:scope` }, '']);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        const dateStub = stub(Date, 'now')
          // 1st event - _isRateLimited - false
          .onCall(0)
          .returns(beforeLimit)
          // 1st event - _handleRateLimit
          .onCall(1)
          .returns(beforeLimit)
          // 2nd event - _isRateLimited - false (different category)
          .onCall(2)
          .returns(withinLimit)
          // 2nd event - _handleRateLimit
          .onCall(3)
          .returns(withinLimit)
          // 3rd event - _isRateLimited - true
          .onCall(4)
          .returns(withinLimit)
          // 4th event - _isRateLimited - false
          .onCall(5)
          .returns(afterLimit)
          // 4th event - _handleRateLimit
          .onCall(6)
          .returns(afterLimit);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(undefined);
          expect(server.requests.length).equal(1);
        }

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).equal(Status.Success);
        expect(server.requests.length).equal(2);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(server.requests.length).equal(2);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(server.requests.length).equal(3);

        dateStub.restore();
      });

      it('back-off using X-Sentry-Rate-Limits with multiple categories', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [
          429,
          { 'X-Sentry-Rate-Limits': `${retryAfterSeconds}:error;transaction:scope` },
          '',
        ]);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        const dateStub = stub(Date, 'now')
          // 1st event - _isRateLimited - false
          .onCall(0)
          .returns(beforeLimit)
          // 1st event - _handleRateLimit
          .onCall(1)
          .returns(beforeLimit)
          // 2nd event - _isRateLimited - true (event category)
          .onCall(2)
          .returns(withinLimit)
          // 3rd event - _isRateLimited - true (transaction category)
          .onCall(3)
          .returns(withinLimit)
          // 4th event - _isRateLimited - false (event category)
          .onCall(4)
          .returns(afterLimit)
          // 4th event - _handleRateLimit
          .onCall(5)
          .returns(afterLimit)
          // 5th event - _isRateLimited - false (transaction category)
          .onCall(6)
          .returns(afterLimit)
          // 5th event - _handleRateLimit
          .onCall(7)
          .returns(afterLimit);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(undefined);
          expect(server.requests.length).equal(1);
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(server.requests.length).equal(1);
        }

        try {
          await transport.sendEvent(transactionPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(server.requests.length).equal(1);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(server.requests.length).equal(2);

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).equal(Status.Success);
        expect(server.requests.length).equal(3);

        dateStub.restore();
      });

      it('back-off using X-Sentry-Rate-Limits with missing categories should lock them all', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [429, { 'X-Sentry-Rate-Limits': `${retryAfterSeconds}::scope` }, '']);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        const dateStub = stub(Date, 'now')
          // 1st event - _isRateLimited - false
          .onCall(0)
          .returns(beforeLimit)
          // 1st event - _handleRateLimit
          .onCall(1)
          .returns(beforeLimit)
          // 2nd event - _isRateLimited - true (event category)
          .onCall(2)
          .returns(withinLimit)
          // 3rd event - _isRateLimited - true (transaction category)
          .onCall(3)
          .returns(withinLimit)
          // 4th event - _isRateLimited - false (event category)
          .onCall(4)
          .returns(afterLimit)
          // 4th event - _handleRateLimit
          .onCall(5)
          .returns(afterLimit)
          // 5th event - _isRateLimited - false (transaction category)
          .onCall(6)
          .returns(afterLimit)
          // 5th event - _handleRateLimit
          .onCall(7)
          .returns(afterLimit);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(undefined);
          expect(server.requests.length).equal(1);
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(server.requests.length).equal(1);
        }

        try {
          await transport.sendEvent(transactionPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(server.requests.length).equal(1);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(server.requests.length).equal(2);

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).equal(Status.Success);
        expect(server.requests.length).equal(3);

        dateStub.restore();
      });

      it('back-off using X-Sentry-Rate-Limits should also trigger for 200 responses', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [200, { 'X-Sentry-Rate-Limits': `${retryAfterSeconds}:error:scope` }, '']);

        const dateStub = stub(Date, 'now')
          // 1st event - _isRateLimited - false
          .onCall(0)
          .returns(beforeLimit)
          // 1st event - _handleRateLimit
          .onCall(1)
          .returns(beforeLimit)
          // 2nd event - _isRateLimited - true
          .onCall(2)
          .returns(withinLimit)
          // 3rd event - _isRateLimited - false
          .onCall(3)
          .returns(afterLimit)
          // 3rd event - _handleRateLimit
          .onCall(4)
          .returns(afterLimit);

        let eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(server.requests.length).equal(1);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(server.requests.length).equal(1);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);

        eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(server.requests.length).equal(2);

        dateStub.restore();
      });
    });
  });
});
