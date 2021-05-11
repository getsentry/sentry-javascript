import { expect } from 'chai';
import { SinonStub, stub } from 'sinon';

import { Event, Status, Transports } from '../../../src';

const testDsn = 'https://123@sentry.io/42';
const storeUrl = 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7';
const envelopeTunnel = 'https://hello.com/world';
const eventPayload: Event = {
  event_id: '1337',
};
const transactionPayload: Event = {
  event_id: '42',
  type: 'transaction',
};

let fetch: SinonStub;
let transport: Transports.BaseTransport;

describe('FetchTransport', () => {
  beforeEach(() => {
    fetch = (stub(window, 'fetch') as unknown) as SinonStub;
    transport = new Transports.FetchTransport({ dsn: testDsn }, window.fetch);
  });

  afterEach(() => {
    fetch.restore();
  });

  it('inherits composeEndpointUrl() implementation', () => {
    // eslint-disable-next-line deprecation/deprecation
    expect(transport.url).equal(storeUrl);
  });

  describe('sendEvent()', async () => {
    it('sends a request to Sentry servers', async () => {
      const response = { status: 200, headers: new Headers() };

      fetch.returns(Promise.resolve(response));

      const res = await transport.sendEvent(eventPayload);

      expect(res.status).equal(Status.Success);
      expect(fetch.calledOnce).equal(true);
      expect(
        fetch.calledWith(storeUrl, {
          body: JSON.stringify(eventPayload),
          method: 'POST',
          referrerPolicy: 'origin',
        }),
      ).equal(true);
    });

    it('sends a request to envelopeTunnel if configured', async () => {
      transport = new Transports.FetchTransport({ dsn: testDsn, envelopeTunnel }, window.fetch);
      fetch.returns(Promise.resolve({ status: 200, headers: new Headers() }));

      await transport.sendEvent(eventPayload);

      expect(fetch.calledWith(envelopeTunnel)).equal(true);
    });

    it('rejects with non-200 status code', async () => {
      const response = { status: 403, headers: new Headers() };

      fetch.returns(Promise.resolve(response));

      try {
        await transport.sendEvent(eventPayload);
      } catch (res) {
        expect(res.status).equal(403);
        expect(fetch.calledOnce).equal(true);
        expect(
          fetch.calledWith(storeUrl, {
            body: JSON.stringify(eventPayload),
            method: 'POST',
            referrerPolicy: 'origin',
          }),
        ).equal(true);
      }
    });

    it('pass the error to rejection when fetch fails', async () => {
      const response = { status: 403, headers: new Headers() };

      fetch.returns(Promise.reject(response));

      try {
        await transport.sendEvent(eventPayload);
      } catch (res) {
        expect(res).equal(response);
      }
    });

    it('passes in headers', async () => {
      transport = new Transports.FetchTransport(
        {
          dsn: testDsn,
          headers: {
            Accept: 'application/json',
          },
        },
        window.fetch,
      );
      const response = { status: 200, headers: new Headers() };

      fetch.returns(Promise.resolve(response));

      const res = await transport.sendEvent(eventPayload);

      expect(res.status).equal(Status.Success);
      expect(
        fetch.calledWith(storeUrl, {
          body: JSON.stringify(eventPayload),
          headers: {
            Accept: 'application/json',
          },
          method: 'POST',
          referrerPolicy: 'origin',
        }),
      ).equal(true);
    });

    it('passes in fetch parameters', async () => {
      transport = new Transports.FetchTransport(
        {
          dsn: testDsn,
          fetchParameters: {
            credentials: 'include',
          },
        },
        window.fetch,
      );
      const response = { status: 200, headers: new Headers() };

      fetch.returns(Promise.resolve(response));

      const res = await transport.sendEvent(eventPayload);

      expect(res.status).equal(Status.Success);
      expect(
        fetch.calledWith(storeUrl, {
          body: JSON.stringify(eventPayload),
          credentials: 'include',
          method: 'POST',
          referrerPolicy: 'origin',
        }),
      ).equal(true);
    });

    describe('Rate-limiting', () => {
      it('back-off using Retry-After header', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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

        const headers = new Headers();
        headers.set('Retry-After', `${retryAfterSeconds}`);
        fetch.returns(Promise.resolve({ status: 429, headers }));

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(undefined);
          expect(fetch.calledOnce).equal(true);
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(fetch.calledOnce).equal(true);
        }

        fetch.returns(Promise.resolve({ status: 200, headers: new Headers() }));

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(fetch.calledTwice).equal(true);

        dateStub.restore();
      });

      it('back-off using X-Sentry-Rate-Limits with single category', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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

        const headers = new Headers();
        headers.set('X-Sentry-Rate-Limits', `${retryAfterSeconds}:error:scope`);
        fetch.returns(Promise.resolve({ status: 429, headers }));

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(undefined);
          expect(fetch.calledOnce).equal(true);
        }

        fetch.returns(Promise.resolve({ status: 200, headers: new Headers() }));

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).equal(Status.Success);
        expect(fetch.calledTwice).equal(true);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(fetch.calledTwice).equal(true);
        }

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(fetch.calledThrice).equal(true);

        dateStub.restore();
      });

      it('back-off using X-Sentry-Rate-Limits with multiple categories', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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

        const headers = new Headers();
        headers.set('X-Sentry-Rate-Limits', `${retryAfterSeconds}:error;transaction:scope`);
        fetch.returns(Promise.resolve({ status: 429, headers }));

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(undefined);
          expect(fetch.calledOnce).equal(true);
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(fetch.calledOnce).equal(true);
        }

        try {
          await transport.sendEvent(transactionPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(fetch.calledOnce).equal(true);
        }

        fetch.returns(Promise.resolve({ status: 200, headers: new Headers() }));

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(fetch.calledTwice).equal(true);

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).equal(Status.Success);
        expect(fetch.calledThrice).equal(true);

        dateStub.restore();
      });

      it('back-off using X-Sentry-Rate-Limits with missing categories should lock them all', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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

        const headers = new Headers();
        headers.set('X-Sentry-Rate-Limits', `${retryAfterSeconds}::scope`);
        fetch.returns(Promise.resolve({ status: 429, headers }));

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(undefined);
          expect(fetch.calledOnce).equal(true);
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(fetch.calledOnce).equal(true);
        }

        try {
          await transport.sendEvent(transactionPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(fetch.calledOnce).equal(true);
        }

        fetch.returns(Promise.resolve({ status: 200, headers: new Headers() }));

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(fetch.calledTwice).equal(true);

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).equal(Status.Success);
        expect(fetch.calledThrice).equal(true);

        dateStub.restore();
      });

      it('back-off using X-Sentry-Rate-Limits should also trigger for 200 responses', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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

        const headers = new Headers();
        headers.set('X-Sentry-Rate-Limits', `${retryAfterSeconds}:error;transaction:scope`);
        fetch.returns(Promise.resolve({ status: 200, headers }));

        let eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(fetch.calledOnce).equal(true);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect(res.status).equal(429);
          expect(res.reason).equal(`Transport locked till ${new Date(afterLimit)} due to too many requests.`);
          expect(fetch.calledOnce).equal(true);
        }

        fetch.returns(Promise.resolve({ status: 200, headers: new Headers() }));

        eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).equal(Status.Success);
        expect(fetch.calledTwice).equal(true);

        dateStub.restore();
      });
    });
  });
});
