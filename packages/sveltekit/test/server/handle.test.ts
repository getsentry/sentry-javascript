import { addTracingExtensions, Hub, makeMain, Scope, getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import type { Transaction } from '@sentry/types';
import type { Handle } from '@sveltejs/kit';
import { vi } from 'vitest';

import { sentryHandle } from '../../src/server/handle';
import { getDefaultNodeClientOptions } from '../utils';

const mockCaptureException = vi.fn();
let mockScope = new Scope();

vi.mock('@sentry/node', async () => {
  const original = (await vi.importActual('@sentry/node')) as any;
  return {
    ...original,
    captureException: (err: unknown, cb: (arg0: unknown) => unknown) => {
      cb(mockScope);
      mockCaptureException(err, cb);
      return original.captureException(err, cb);
    },
  };
});

const mockAddExceptionMechanism = vi.fn();

vi.mock('@sentry/utils', async () => {
  const original = (await vi.importActual('@sentry/utils')) as any;
  return {
    ...original,
    addExceptionMechanism: (...args: unknown[]) => mockAddExceptionMechanism(...args),
  };
});

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

function resolve(type: Type, isError: boolean): Parameters<Handle>[0]['resolve'] {
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

describe('handleSentry', () => {
  beforeAll(() => {
    addTracingExtensions();
  });

  beforeEach(() => {
    mockScope = new Scope();
    const options = getDefaultNodeClientOptions({ tracesSampleRate: 1.0 });
    client = new NodeClient(options);
    hub = new Hub(client);
    makeMain(hub);

    mockCaptureException.mockClear();
    mockAddExceptionMechanism.mockClear();
  });

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
        response = await sentryHandle({ event: mockEvent(), resolve: resolve(type, isError) });
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toEqual(type);
      }

      expect(response).toEqual(mockResponse);
    });

    it('creates a transaction', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', (transaction: Transaction) => {
        ref = transaction;
      });

      try {
        await sentryHandle({ event: mockEvent(), resolve: resolve(type, isError) });
      } catch (e) {
        //
      }

      expect(ref).toBeDefined();

      expect(ref.name).toEqual('GET /users/[id]');
      expect(ref.op).toEqual('http.server');
      expect(ref.status).toEqual(isError ? 'internal_error' : 'ok');
      expect(ref.metadata.source).toEqual('route');

      expect(ref.endTimestamp).toBeDefined();
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
        await sentryHandle({ event, resolve: resolve(type, isError) });
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
        await sentryHandle({ event, resolve: resolve(type, isError) });
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
      const addEventProcessorSpy = vi.spyOn(mockScope, 'addEventProcessor').mockImplementationOnce(callback => {
        void callback({}, { event_id: 'fake-event-id' });
        return mockScope;
      });

      try {
        await sentryHandle({ event: mockEvent(), resolve: resolve(type, isError) });
      } catch (e) {
        expect(mockCaptureException).toBeCalledTimes(1);
        expect(addEventProcessorSpy).toBeCalledTimes(1);
        expect(mockAddExceptionMechanism).toBeCalledTimes(1);
        expect(mockAddExceptionMechanism).toBeCalledWith(
          {},
          { handled: false, type: 'sveltekit', data: { function: 'handle' } },
        );
      }
    });
  });
});
