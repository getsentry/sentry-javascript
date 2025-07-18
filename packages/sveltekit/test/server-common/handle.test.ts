import type { EventEnvelopeHeaders, Span } from '@sentry/core';
import {
  getRootSpan,
  getSpanDescendants,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanIsSampled,
  spanToJSON,
} from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { NodeClient, setCurrentClient } from '@sentry/node';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addSentryCodeToPage,
  FETCH_PROXY_SCRIPT,
  isFetchProxyRequired,
  sentryHandle,
} from '../../src/server-common/handle';
import { getDefaultNodeClientOptions } from '../utils';

const mockCaptureException = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'xx');

function mockEvent(override: Record<string, unknown> = {}): Parameters<Handle>[0]['event'] {
  const event: Parameters<Handle>[0]['event'] = {
    cookies: {} as any,
    fetch: () => Promise.resolve({} as any),
    getClientAddress: () => '',
    locals: {},
    params: { id: '123' },
    platform: {},
    request: {
      method: 'GET',
      headers: {
        get: () => null,
        append: () => {},
        delete: () => {},
        forEach: () => {},
        has: () => false,
        set: () => {},
      },
    } as any,
    route: { id: '/users/[id]' },
    setHeaders: () => {},
    url: new URL('http://localhost:3000/users/123'),
    isDataRequest: false,

    ...override,
  };

  return event;
}

const mockResponse = { status: 200, headers: {}, body: '' } as any;

const enum Type {
  Sync = 'sync',
  Async = 'async',
}

function resolve(
  type: Type,
  isError: boolean,
  throwSpecialError?: 'redirect' | 'http',
): Parameters<Handle>[0]['resolve'] {
  if (throwSpecialError === 'redirect') {
    throw redirect(302, '/redirect');
  }
  if (throwSpecialError === 'http') {
    throw { status: 404, body: 'Not found' };
  }

  if (type === Type.Sync) {
    return (..._args: unknown[]) => {
      if (isError) {
        throw new Error(type);
      }

      return mockResponse;
    };
  }

  return (..._args: unknown[]) => {
    return new Promise((resolve, reject) => {
      if (isError) {
        reject(new Error(type));
      } else {
        resolve(mockResponse);
      }
    });
  };
}

let client: NodeClient;

beforeEach(() => {
  const options = getDefaultNodeClientOptions({ tracesSampleRate: 1.0 });
  client = new NodeClient(options);
  setCurrentClient(client);
  client.init();

  mockCaptureException.mockClear();
  vi.clearAllMocks();
});

describe('sentryHandle', () => {
  describe.each([
    // isSync, isError, expectedResponse
    [Type.Sync, true, undefined],
    [Type.Sync, false, mockResponse],
    [Type.Async, true, undefined],
    [Type.Async, false, mockResponse],
  ])('%s resolve with error %s', (type, isError, mockResponse) => {
    it('should return a response', async () => {
      let response: any = undefined;
      try {
        response = await sentryHandle()({ event: mockEvent(), resolve: resolve(type, isError) });
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toEqual(type);
      }

      expect(response).toEqual(mockResponse);
    });

    it("creates a transaction if there's no active span", async () => {
      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        if (span === getRootSpan(span)) {
          _span = span;
        }
      });

      try {
        await sentryHandle()({ event: mockEvent(), resolve: resolve(type, isError) });
      } catch {
        //
      }

      expect(_span!).toBeDefined();

      expect(spanToJSON(_span!).description).toEqual('GET /users/[id]');
      expect(spanToJSON(_span!).op).toEqual('http.server');
      expect(spanToJSON(_span!).status).toEqual(isError ? 'internal_error' : 'ok');
      expect(spanToJSON(_span!).data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('route');

      expect(spanToJSON(_span!).timestamp).toBeDefined();

      const spans = getSpanDescendants(_span!);
      expect(spans).toHaveLength(1);
    });

    it('creates a child span for nested server calls (i.e. if there is an active span)', async () => {
      let _span: Span | undefined = undefined;
      let txnCount = 0;
      client.on('spanEnd', span => {
        if (span === getRootSpan(span)) {
          _span = span;
          ++txnCount;
        }
      });

      try {
        await sentryHandle()({
          event: mockEvent(),
          resolve: async _ => {
            // simulating a nested load call:
            await sentryHandle()({
              event: mockEvent({ route: { id: 'api/users/details/[id]', isSubRequest: true } }),
              resolve: resolve(type, isError),
            });
            return mockResponse;
          },
        });
      } catch {
        //
      }

      expect(txnCount).toEqual(1);
      expect(_span!).toBeDefined();

      expect(spanToJSON(_span!).description).toEqual('GET /users/[id]');
      expect(spanToJSON(_span!).op).toEqual('http.server');
      expect(spanToJSON(_span!).status).toEqual(isError ? 'internal_error' : 'ok');
      expect(spanToJSON(_span!).data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('route');

      expect(spanToJSON(_span!).timestamp).toBeDefined();

      const spans = getSpanDescendants(_span!).map(spanToJSON);

      expect(spans).toHaveLength(2);
      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ op: 'http.server', description: 'GET /users/[id]' }),
          expect.objectContaining({ op: 'http.server', description: 'GET api/users/details/[id]' }),
        ]),
      );
    });

    it("creates a transaction from sentry-trace header but doesn't populate a new DSC", async () => {
      const event = mockEvent({
        request: {
          headers: {
            get: (key: string) => {
              if (key === 'sentry-trace') {
                return '1234567890abcdef1234567890abcdef-1234567890abcdef-1';
              }

              return null;
            },
          },
        },
      });

      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        if (span === getRootSpan(span)) {
          _span = span;
        }
      });

      let envelopeHeaders: EventEnvelopeHeaders | undefined = undefined;
      client.on('beforeEnvelope', env => {
        envelopeHeaders = env[0] as EventEnvelopeHeaders;
      });

      try {
        await sentryHandle()({ event, resolve: resolve(type, isError) });
      } catch {
        //
      }

      expect(_span).toBeDefined();
      expect(_span!.spanContext().traceId).toEqual('1234567890abcdef1234567890abcdef');
      expect(spanToJSON(_span!).parent_span_id).toEqual('1234567890abcdef');
      expect(spanIsSampled(_span!)).toEqual(true);
      expect(envelopeHeaders!.trace).toEqual({});
    });

    it('creates a transaction with dynamic sampling context from baggage header', async () => {
      const event = mockEvent({
        request: {
          headers: {
            get: (key: string) => {
              if (key === 'sentry-trace') {
                return '1234567890abcdef1234567890abcdef-1234567890abcdef-1';
              }

              if (key === 'baggage') {
                return (
                  'sentry-environment=production,sentry-release=1.0.0,sentry-transaction=dogpark,' +
                  'sentry-public_key=dogsarebadatkeepingsecrets,' +
                  'sentry-trace_id=1234567890abcdef1234567890abcdef,sentry-sample_rate=1,' +
                  'sentry-sample_rand=0.42'
                );
              }

              return null;
            },
          },
        },
      });

      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        if (span === getRootSpan(span)) {
          _span = span;
        }
      });

      let envelopeHeaders: EventEnvelopeHeaders | undefined = undefined;
      client.on('beforeEnvelope', env => {
        envelopeHeaders = env[0] as EventEnvelopeHeaders;
      });

      try {
        await sentryHandle()({ event, resolve: resolve(type, isError) });
      } catch {
        //
      }

      expect(_span!).toBeDefined();
      expect(envelopeHeaders!.trace).toEqual({
        environment: 'production',
        release: '1.0.0',
        public_key: 'dogsarebadatkeepingsecrets',
        sample_rate: '1',
        trace_id: '1234567890abcdef1234567890abcdef',
        transaction: 'dogpark',
        sample_rand: '0.42',
      });
    });

    it('send errors to Sentry', async () => {
      try {
        await sentryHandle()({ event: mockEvent(), resolve: resolve(type, isError) });
      } catch (e) {
        expect(mockCaptureException).toBeCalledTimes(1);
        expect(mockCaptureException).toBeCalledWith(expect.any(Error), {
          mechanism: { handled: false, type: 'sveltekit', data: { function: 'handle' } },
        });
      }
    });

    it("doesn't send redirects in a request handler to Sentry", async () => {
      try {
        await sentryHandle()({ event: mockEvent(), resolve: resolve(type, false, 'redirect') });
      } catch {
        expect(mockCaptureException).toBeCalledTimes(0);
      }
    });

    it("doesn't send Http 4xx errors in a request handler to Sentry", async () => {
      try {
        await sentryHandle()({ event: mockEvent(), resolve: resolve(type, false, 'http') });
      } catch {
        expect(mockCaptureException).toBeCalledTimes(0);
      }
    });

    it('calls `transformPageChunk`', async () => {
      const mockResolve = vi.fn().mockImplementation(resolve(type, isError));
      const event = mockEvent();
      try {
        await sentryHandle()({ event, resolve: mockResolve });
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        // @ts-expect-error - this is fine
        expect(e.message).toEqual(type);
      }

      expect(mockResolve).toHaveBeenCalledTimes(1);
      expect(mockResolve).toHaveBeenCalledWith(event, { transformPageChunk: expect.any(Function) });
    });

    it("doesn't create a transaction if there's no route", async () => {
      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        if (span === getRootSpan(span)) {
          _span = span;
        }
      });

      try {
        await sentryHandle()({ event: mockEvent({ route: undefined }), resolve: resolve(type, isError) });
      } catch {
        //
      }

      expect(_span!).toBeUndefined();
    });

    it("Creates a transaction if there's no route but `handleUnknownRequests` is true", async () => {
      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        if (span === getRootSpan(span)) {
          _span = span;
        }
      });

      try {
        await sentryHandle({ handleUnknownRoutes: true })({
          event: mockEvent({ route: undefined }),
          resolve: resolve(type, isError),
        });
      } catch {
        //
      }

      expect(_span!).toBeDefined();
    });

    it("doesn't create an isolation scope when the `_sentrySkipRequestIsolation` local is set", async () => {
      const withIsolationScopeSpy = vi.spyOn(SentryCore, 'withIsolationScope');
      const continueTraceSpy = vi.spyOn(SentryCore, 'continueTrace');

      try {
        await sentryHandle({ handleUnknownRoutes: true })({
          event: { ...mockEvent({ route: undefined }), locals: { _sentrySkipRequestIsolation: true } },
          resolve: resolve(type, isError),
        });
      } catch {
        //
      }

      expect(withIsolationScopeSpy).not.toHaveBeenCalled();
      expect(continueTraceSpy).not.toHaveBeenCalled();
    });
  });
});

describe('addSentryCodeToPage', () => {
  const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <link rel="icon" href="%sveltekit.assets%/favicon.png" />
      <meta name="viewport" content="width=device-width" />
    </head>
    <body data-sveltekit-preload-data="hover">
      <div style="display: contents">%sveltekit.body%</div>
    </body>
  </html>`;

  it("Adds add meta tags and fetch proxy script if there's no active transaction", () => {
    const transformPageChunk = addSentryCodeToPage({ injectFetchProxyScript: true });
    const transformed = transformPageChunk({ html, done: true });

    expect(transformed).toContain('<meta name="sentry-trace"');
    expect(transformed).toContain('<meta name="baggage"');
    expect(transformed).not.toContain('sentry-transaction=');
    expect(transformed).toContain(`<script>${FETCH_PROXY_SCRIPT}</script>`);
  });

  it('adds meta tags and the fetch proxy script if there is an active transaction', () => {
    const transformPageChunk = addSentryCodeToPage({ injectFetchProxyScript: true });
    SentryCore.startSpan({ name: 'test' }, () => {
      const transformed = transformPageChunk({ html, done: true }) as string;

      expect(transformed).toContain('<meta name="sentry-trace"');
      expect(transformed).toContain('<meta name="baggage"');
      expect(transformed).toContain('sentry-transaction=test');
      expect(transformed).toContain(`<script>${FETCH_PROXY_SCRIPT}</script>`);
    });
  });

  it('does not add the fetch proxy script if the `injectFetchProxyScript` option is false', () => {
    const transformPageChunk = addSentryCodeToPage({ injectFetchProxyScript: false });
    const transformed = transformPageChunk({ html, done: true }) as string;

    expect(transformed).toContain('<meta name="sentry-trace"');
    expect(transformed).toContain('<meta name="baggage"');
    expect(transformed).not.toContain(`<script >${FETCH_PROXY_SCRIPT}</script>`);
  });
});

describe('isFetchProxyRequired', () => {
  it.each(['2.16.0', '2.16.1', '2.17.0', '3.0.0', '3.0.0-alpha.0'])(
    'returns false if the version is greater than or equal to 2.16.0 (%s)',
    version => {
      expect(isFetchProxyRequired(version)).toBe(false);
    },
  );

  it.each(['2.15.0', '2.15.1', '1.30.0', '1.0.0'])('returns true if the version is lower than 2.16.0 (%s)', version => {
    expect(isFetchProxyRequired(version)).toBe(true);
  });

  it.each(['invalid', 'a.b.c'])('returns true for an invalid version (%s)', version => {
    expect(isFetchProxyRequired(version)).toBe(true);
  });
});
