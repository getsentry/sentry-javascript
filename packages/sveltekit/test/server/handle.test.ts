import { addTracingExtensions, Hub, makeMain } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import * as SentryNode from '@sentry/node';
import type { Transaction } from '@sentry/types';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { vi } from 'vitest';

import { sentryHandle, transformPageChunk } from '../../src/server/handle';
import { getDefaultNodeClientOptions } from '../utils';

const mockCaptureException = vi.spyOn(SentryNode, 'captureException').mockImplementation(() => 'xx');

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

let hub: Hub;
let client: NodeClient;

beforeAll(() => {
  addTracingExtensions();
});

beforeEach(() => {
  const options = getDefaultNodeClientOptions({ tracesSampleRate: 1.0 });
  client = new NodeClient(options);
  hub = new Hub(client);
  makeMain(hub);

  mockCaptureException.mockClear();
});

describe('handleSentry', () => {
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
      let ref: any = undefined;
      client.on('finishTransaction', (transaction: Transaction) => {
        ref = transaction;
      });

      try {
        await sentryHandle()({ event: mockEvent(), resolve: resolve(type, isError) });
      } catch (e) {
        //
      }

      expect(ref).toBeDefined();

      expect(ref.name).toEqual('GET /users/[id]');
      expect(ref.op).toEqual('http.server');
      expect(ref.status).toEqual(isError ? 'internal_error' : 'ok');
      expect(ref.metadata.source).toEqual('route');

      expect(ref.endTimestamp).toBeDefined();
      expect(ref.spanRecorder.spans).toHaveLength(1);
    });

    it('creates a child span for nested server calls (i.e. if there is an active span)', async () => {
      let ref: any = undefined;
      let txnCount = 0;
      client.on('finishTransaction', (transaction: Transaction) => {
        ref = transaction;
        ++txnCount;
      });

      try {
        await sentryHandle()({
          event: mockEvent(),
          resolve: async _ => {
            // simulateing a nested load call:
            await sentryHandle()({
              event: mockEvent({ route: { id: 'api/users/details/[id]' } }),
              resolve: resolve(type, isError),
            });
            return mockResponse;
          },
        });
      } catch (e) {
        //
      }

      expect(txnCount).toEqual(1);
      expect(ref).toBeDefined();

      expect(ref.name).toEqual('GET /users/[id]');
      expect(ref.op).toEqual('http.server');
      expect(ref.status).toEqual(isError ? 'internal_error' : 'ok');
      expect(ref.metadata.source).toEqual('route');

      expect(ref.endTimestamp).toBeDefined();

      expect(ref.spanRecorder.spans).toHaveLength(2);
      expect(ref.spanRecorder.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ op: 'http.server', name: 'GET /users/[id]' }),
          expect.objectContaining({ op: 'http.server', description: 'GET api/users/details/[id]' }),
        ]),
      );
    });

    it('creates a transaction from sentry-trace header', async () => {
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

      let ref: any = undefined;
      client.on('finishTransaction', (transaction: Transaction) => {
        ref = transaction;
      });

      try {
        await sentryHandle()({ event, resolve: resolve(type, isError) });
      } catch (e) {
        //
      }

      expect(ref).toBeDefined();
      expect(ref.traceId).toEqual('1234567890abcdef1234567890abcdef');
      expect(ref.parentSpanId).toEqual('1234567890abcdef');
      expect(ref.sampled).toEqual(true);
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
                  'sentry-user_segment=segmentA,sentry-public_key=dogsarebadatkeepingsecrets,' +
                  'sentry-trace_id=1234567890abcdef1234567890abcdef,sentry-sample_rate=1'
                );
              }

              return null;
            },
          },
        },
      });

      let ref: any = undefined;
      client.on('finishTransaction', (transaction: Transaction) => {
        ref = transaction;
      });

      try {
        await sentryHandle()({ event, resolve: resolve(type, isError) });
      } catch (e) {
        //
      }

      expect(ref).toBeDefined();
      expect(ref.metadata.dynamicSamplingContext).toEqual({
        environment: 'production',
        release: '1.0.0',
        public_key: 'dogsarebadatkeepingsecrets',
        sample_rate: '1',
        trace_id: '1234567890abcdef1234567890abcdef',
        transaction: 'dogpark',
        user_segment: 'segmentA',
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
      } catch (e) {
        expect(mockCaptureException).toBeCalledTimes(0);
      }
    });

    it("doesn't send Http 4xx errors in a request handler to Sentry", async () => {
      try {
        await sentryHandle()({ event: mockEvent(), resolve: resolve(type, false, 'http') });
      } catch (e) {
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
        expect(e.message).toEqual(type);
      }

      expect(mockResolve).toHaveBeenCalledTimes(1);
      expect(mockResolve).toHaveBeenCalledWith(event, { transformPageChunk: expect.any(Function) });
    });

    it("doesn't create a transaction if there's no route", async () => {
      let ref: any = undefined;
      client.on('finishTransaction', (transaction: Transaction) => {
        ref = transaction;
      });

      try {
        await sentryHandle()({ event: mockEvent({ route: undefined }), resolve: resolve(type, isError) });
      } catch {
        //
      }

      expect(ref).toBeUndefined();
    });

    it("Creates a transaction if there's no route but `handleUnknownRequests` is true", async () => {
      let ref: any = undefined;
      client.on('finishTransaction', (transaction: Transaction) => {
        ref = transaction;
      });

      try {
        await sentryHandle({ handleUnknownRoutes: true })({
          event: mockEvent({ route: undefined }),
          resolve: resolve(type, isError),
        });
      } catch {
        //
      }

      expect(ref).toBeDefined();
    });
  });
});

describe('transformPageChunk', () => {
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

  it('does not add meta tags if no active transaction', () => {
    const transformed = transformPageChunk({ html, done: true });
    expect(transformed).toEqual(html);
  });

  it('adds meta tags if there is an active transaction', () => {
    const transaction = hub.startTransaction({ name: 'test' });
    hub.getScope().setSpan(transaction);
    const transformed = transformPageChunk({ html, done: true }) as string;

    expect(transformed.includes('<meta name="sentry-trace"')).toEqual(true);
    expect(transformed.includes('<meta name="baggage"')).toEqual(true);
  });
});
