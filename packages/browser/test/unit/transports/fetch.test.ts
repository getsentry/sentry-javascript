import { SentryError } from '@sentry/utils';

import { Event, Response, Transports } from '../../../src';

const testDsn = 'https://123@sentry.io/42';
const storeUrl = 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7';
const tunnel = 'https://hello.com/world';
const eventPayload: Event = {
  event_id: '1337',
};
const transactionPayload: Event = {
  event_id: '42',
  type: 'transaction',
};

const fetch = jest.fn();
let transport: Transports.BaseTransport;

// eslint-disable-next-line no-var
declare var window: any;

jest.mock('@sentry/utils', () => {
  return {
    ...jest.requireActual('@sentry/utils'),
    supportsReferrerPolicy(): boolean {
      return true;
    },
  };
});

describe('FetchTransport', () => {
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

  afterEach(() => {
    fetch.mockRestore();
  });

  it('inherits composeEndpointUrl() implementation', () => {
    // eslint-disable-next-line deprecation/deprecation
    expect(transport.url).toBe(storeUrl);
  });

  describe('sendEvent()', () => {
    it('sends a request to Sentry servers', async () => {
      const response = { status: 200, headers: new Headers() };

      window.fetch.mockImplementation(() => Promise.resolve(response));

      const res = await transport.sendEvent(eventPayload);

      expect((res as Response).status).toBe('success');
      expect(fetch).toHaveBeenCalledWith(storeUrl, {
        body: JSON.stringify(eventPayload),
        method: 'POST',
        referrerPolicy: 'origin',
      });
    });

    it('sends a request to tunnel if configured', async () => {
      transport = new Transports.FetchTransport({ dsn: testDsn, tunnel }, window.fetch);
      window.fetch.mockImplementation(() => Promise.resolve({ status: 200, headers: new Headers() }));

      await transport.sendEvent(eventPayload);

      expect(fetch.mock.calls[0][0]).toBe(tunnel);
    });

    it('rejects with non-200 status code', async () => {
      const response = { status: 403, headers: new Headers() };

      window.fetch.mockImplementation(() => Promise.resolve(response));

      try {
        await transport.sendEvent(eventPayload);
      } catch (res) {
        expect((res as Response).status).toBe(403);
        expect(fetch).toHaveBeenCalledWith(storeUrl, {
          body: JSON.stringify(eventPayload),
          method: 'POST',
          referrerPolicy: 'origin',
        });
      }
    });

    it('pass the error to rejection when fetch fails', async () => {
      const response = { status: 403, headers: new Headers() };

      window.fetch.mockImplementation(() => Promise.reject(response));

      try {
        await transport.sendEvent(eventPayload);
      } catch (res) {
        expect(res).toBe(response);
      }
    });

    it('should record dropped event when fetch fails', async () => {
      const response = { status: 403, headers: new Headers() };

      window.fetch.mockImplementation(() => Promise.reject(response));

      const spy = jest.spyOn(transport, 'recordLostEvent');

      try {
        await transport.sendEvent(eventPayload);
      } catch (_) {
        expect(spy).toHaveBeenCalledWith('network_error', 'event');
      }
    });

    it('should record dropped event when queue buffer overflows', async () => {
      // @ts-ignore private method
      jest.spyOn(transport._buffer, 'add').mockRejectedValue(new SentryError('Buffer Full'));
      const spy = jest.spyOn(transport, 'recordLostEvent');

      try {
        await transport.sendEvent(transactionPayload);
      } catch (_) {
        expect(spy).toHaveBeenCalledWith('queue_overflow', 'transaction');
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

      window.fetch.mockImplementation(() => Promise.resolve(response));

      const res = await transport.sendEvent(eventPayload);

      expect((res as Response).status).toBe('success');
      expect(fetch).toHaveBeenCalledWith(storeUrl, {
        body: JSON.stringify(eventPayload),
        headers: {
          Accept: 'application/json',
        },
        method: 'POST',
        referrerPolicy: 'origin',
      });
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

      window.fetch.mockImplementation(() => Promise.resolve(response));

      const res = await transport.sendEvent(eventPayload);

      expect((res as Response).status).toBe('success');
      expect(fetch).toHaveBeenCalledWith(storeUrl, {
        body: JSON.stringify(eventPayload),
        credentials: 'include',
        method: 'POST',
        referrerPolicy: 'origin',
      });
    });

    describe('Rate-limiting', () => {
      it('back-off using Retry-After header', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - true
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - false
          .mockImplementationOnce(() => afterLimit)
          // 3rd event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        const headers = new Headers();
        headers.set('Retry-After', `${retryAfterSeconds}`);
        window.fetch.mockImplementation(() => Promise.resolve({ status: 429, headers }));

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBeUndefined();
          expect(fetch).toHaveBeenCalled();
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(fetch).toHaveBeenCalled();
        }

        window.fetch.mockImplementation(() => Promise.resolve({ status: 200, headers: new Headers() }));

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      it('back-off using X-Sentry-Rate-Limits with single category', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - false (different category)
          .mockImplementationOnce(() => withinLimit)
          // 2nd event - _handleRateLimit
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - true
          .mockImplementationOnce(() => withinLimit)
          // 4th event - _isRateLimited - false
          .mockImplementationOnce(() => afterLimit)
          // 4th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        const headers = new Headers();
        headers.set('X-Sentry-Rate-Limits', `${retryAfterSeconds}:error:scope`);
        window.fetch.mockImplementation(() => Promise.resolve({ status: 429, headers }));

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBeUndefined();
          expect(fetch).toHaveBeenCalled();
        }

        window.fetch.mockImplementation(() => Promise.resolve({ status: 200, headers: new Headers() }));

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(2);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(fetch).toHaveBeenCalledTimes(2);
        }

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(3);
      });

      it('back-off using X-Sentry-Rate-Limits with multiple categories', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - true (event category)
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - true (transaction category)
          .mockImplementationOnce(() => withinLimit)
          // 4th event - _isRateLimited - false (event category)
          .mockImplementationOnce(() => afterLimit)
          // 4th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit)
          // 5th event - _isRateLimited - false (transaction category)
          .mockImplementationOnce(() => afterLimit)
          // 5th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        const headers = new Headers();
        headers.set('X-Sentry-Rate-Limits', `${retryAfterSeconds}:error;transaction:scope`);
        window.fetch.mockImplementation(() => Promise.resolve({ status: 429, headers }));

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBeUndefined();
          expect(fetch).toHaveBeenCalled();
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(fetch).toHaveBeenCalled();
        }

        try {
          await transport.sendEvent(transactionPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for transaction requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(fetch).toHaveBeenCalled();
        }

        window.fetch.mockImplementation(() => Promise.resolve({ status: 200, headers: new Headers() }));

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(2);

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(3);
      });

      it('back-off using X-Sentry-Rate-Limits with missing categories should lock them all', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - true (event category)
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - true (transaction category)
          .mockImplementationOnce(() => withinLimit)
          // 4th event - _isRateLimited - false (event category)
          .mockImplementationOnce(() => afterLimit)
          // 4th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit)
          // 5th event - _isRateLimited - false (transaction category)
          .mockImplementationOnce(() => afterLimit)
          // 5th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        const headers = new Headers();
        headers.set('X-Sentry-Rate-Limits', `${retryAfterSeconds}::scope`);
        window.fetch.mockImplementation(() => Promise.resolve({ status: 429, headers }));

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBeUndefined();
          expect(fetch).toHaveBeenCalled();
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(fetch).toHaveBeenCalled();
        }

        try {
          await transport.sendEvent(transactionPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for transaction requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(fetch).toHaveBeenCalled();
        }

        window.fetch.mockImplementation(() => Promise.resolve({ status: 200, headers: new Headers() }));

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(2);

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(3);
      });

      it('back-off using X-Sentry-Rate-Limits should also trigger for 200 responses', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - true
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - false
          .mockImplementationOnce(() => afterLimit)
          // 3rd event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        const headers = new Headers();
        headers.set('X-Sentry-Rate-Limits', `${retryAfterSeconds}:error;transaction:scope`);
        window.fetch.mockImplementation(() => Promise.resolve({ status: 200, headers }));

        let eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(fetch).toHaveBeenCalled();

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(fetch).toHaveBeenCalled();
        }

        window.fetch.mockImplementation(() => Promise.resolve({ status: 200, headers: new Headers() }));

        eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      it('should record dropped event', async () => {
        // @ts-ignore private method
        jest.spyOn(transport, '_isRateLimited').mockReturnValue(true);

        const spy = jest.spyOn(transport, 'recordLostEvent');

        try {
          await transport.sendEvent(eventPayload);
        } catch (_) {
          expect(spy).toHaveBeenCalledWith('ratelimit_backoff', 'event');
        }

        try {
          await transport.sendEvent(transactionPayload);
        } catch (_) {
          expect(spy).toHaveBeenCalledWith('ratelimit_backoff', 'transaction');
        }
      });
    });
  });
});
