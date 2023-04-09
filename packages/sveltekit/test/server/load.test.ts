import { addTracingExtensions } from '@sentry/core';
import { Scope } from '@sentry/node';
import type { Load, ServerLoad } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { vi } from 'vitest';

import { wrapLoadWithSentry, wrapServerLoadWithSentry } from '../../src/server/load';

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

const mockTrace = vi.fn();

vi.mock('@sentry/core', async () => {
  const original = (await vi.importActual('@sentry/core')) as any;
  return {
    ...original,
    trace: (...args: unknown[]) => {
      mockTrace(...args);
      return original.trace(...args);
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

function getById(_id?: string) {
  throw new Error('error');
}

const MOCK_LOAD_ARGS: any = {
  params: { id: '123' },
  route: {
    id: '/users/[id]',
  },
  url: new URL('http://localhost:3000/users/123'),
};

const MOCK_LOAD_NO_ROUTE_ARGS: any = {
  params: { id: '123' },
  url: new URL('http://localhost:3000/users/123'),
};

const MOCK_SERVER_ONLY_LOAD_ARGS: any = {
  ...MOCK_LOAD_ARGS,
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
};

const MOCK_SERVER_ONLY_NO_TRACE_LOAD_ARGS: any = {
  ...MOCK_LOAD_ARGS,
  request: {
    headers: {
      get: (_: string) => {
        return null;
      },
    },
  },
};

const MOCK_SERVER_ONLY_NO_BAGGAGE_LOAD_ARGS: any = {
  ...MOCK_LOAD_ARGS,
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
};

beforeAll(() => {
  addTracingExtensions();
});

beforeEach(() => {
  mockCaptureException.mockClear();
  mockAddExceptionMechanism.mockClear();
  mockTrace.mockClear();
  mockScope = new Scope();
});

describe.each([
  ['wrapLoadWithSentry', wrapLoadWithSentry],
  ['wrapServerLoadWithSentry', wrapServerLoadWithSentry],
])('Common functionality of load wrappers (%s) ', (_, sentryLoadWrapperFn) => {
  it('calls captureException', async () => {
    async function load({ params }) {
      return {
        post: getById(params.id),
      };
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad(MOCK_LOAD_ARGS);
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  describe('with error() helper', () => {
    it.each([
      // [statusCode, timesCalled]
      [400, 0],
      [401, 0],
      [403, 0],
      [404, 0],
      [409, 0],
      [429, 0],
      [499, 0],
      [500, 1],
      [501, 1],
      [503, 1],
      [504, 1],
    ])('error with status code %s calls captureException %s times', async (code, times) => {
      async function load({ params }) {
        throw error(code, params.id);
      }

      const wrappedLoad = wrapLoadWithSentry(load);
      const res = wrappedLoad({ ...MOCK_LOAD_ARGS });
      await expect(res).rejects.toThrow();

      expect(mockCaptureException).toHaveBeenCalledTimes(times);
    });
  });

  it("doesn't call captureException for thrown `Redirect`s", async () => {
    async function load(_: Parameters<Load>[0]): Promise<ReturnType<Load>> {
      throw redirect(300, 'other/route');
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad(MOCK_LOAD_ARGS);
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('adds an exception mechanism', async () => {
    const addEventProcessorSpy = vi.spyOn(mockScope, 'addEventProcessor').mockImplementationOnce(callback => {
      void callback({}, { event_id: 'fake-event-id' });
      return mockScope;
    });

    async function load({ params }) {
      return {
        post: getById(params.id),
      };
    }

    const wrappedLoad = sentryLoadWrapperFn.call(this, load);
    const res = wrappedLoad(MOCK_SERVER_ONLY_LOAD_ARGS);
    await expect(res).rejects.toThrow();

    expect(addEventProcessorSpy).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledWith(
      {},
      { handled: false, type: 'sveltekit', data: { function: 'load' } },
    );
  });
});
describe('wrapLoadWithSentry calls trace', () => {
  async function load({ params }: Parameters<Load>[0]): Promise<ReturnType<Load>> {
    return {
      post: params.id,
    };
  }

  it('with the context of the universal load function', async () => {
    const wrappedLoad = wrapLoadWithSentry(load);
    await wrappedLoad(MOCK_LOAD_ARGS);

    expect(mockTrace).toHaveBeenCalledTimes(1);
    expect(mockTrace).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.load',
        name: '/users/[id]',
        status: 'ok',
        metadata: {
          source: 'route',
        },
      },
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('falls back to the raw url if `event.route.id` is not available', async () => {
    const wrappedLoad = wrapLoadWithSentry(load);
    await wrappedLoad(MOCK_LOAD_NO_ROUTE_ARGS);

    expect(mockTrace).toHaveBeenCalledTimes(1);
    expect(mockTrace).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.load',
        name: '/users/123',
        status: 'ok',
        metadata: {
          source: 'url',
        },
      },
      expect.any(Function),
      expect.any(Function),
    );
  });
});

describe('wrapServerLoadWithSentry calls trace', () => {
  async function serverLoad({ params }: Parameters<ServerLoad>[0]): Promise<ReturnType<ServerLoad>> {
    return {
      post: params.id,
    };
  }

  it('attaches trace data if available', async () => {
    const wrappedLoad = wrapServerLoadWithSentry(serverLoad);
    await wrappedLoad(MOCK_SERVER_ONLY_LOAD_ARGS);

    expect(mockTrace).toHaveBeenCalledTimes(1);
    expect(mockTrace).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.server.load',
        name: '/users/[id]',
        parentSampled: true,
        parentSpanId: '1234567890abcdef',
        status: 'ok',
        traceId: '1234567890abcdef1234567890abcdef',
        metadata: {
          dynamicSamplingContext: {
            environment: 'production',
            public_key: 'dogsarebadatkeepingsecrets',
            release: '1.0.0',
            sample_rate: '1',
            trace_id: '1234567890abcdef1234567890abcdef',
            transaction: 'dogpark',
            user_segment: 'segmentA',
          },
          source: 'route',
        },
      },
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("doesn't attach trace data if it's not available", async () => {
    const wrappedLoad = wrapServerLoadWithSentry(serverLoad);
    await wrappedLoad(MOCK_SERVER_ONLY_NO_TRACE_LOAD_ARGS);

    expect(mockTrace).toHaveBeenCalledTimes(1);
    expect(mockTrace).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.server.load',
        name: '/users/[id]',
        status: 'ok',
        metadata: {
          source: 'route',
        },
      },
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("doesn't attach the DSC data if the baggage header not available", async () => {
    const wrappedLoad = wrapServerLoadWithSentry(serverLoad);
    await wrappedLoad(MOCK_SERVER_ONLY_NO_BAGGAGE_LOAD_ARGS);

    expect(mockTrace).toHaveBeenCalledTimes(1);
    expect(mockTrace).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.server.load',
        name: '/users/[id]',
        parentSampled: true,
        parentSpanId: '1234567890abcdef',
        status: 'ok',
        traceId: '1234567890abcdef1234567890abcdef',
        metadata: {
          dynamicSamplingContext: {},
          source: 'route',
        },
      },
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('falls back to the raw url if `event.route.id` is not available', async () => {
    const event = { ...MOCK_SERVER_ONLY_LOAD_ARGS };
    delete event.route;
    const wrappedLoad = wrapServerLoadWithSentry(serverLoad);
    await wrappedLoad(event);

    expect(mockTrace).toHaveBeenCalledTimes(1);
    expect(mockTrace).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.server.load',
        name: '/users/123',
        parentSampled: true,
        parentSpanId: '1234567890abcdef',
        status: 'ok',
        traceId: '1234567890abcdef1234567890abcdef',
        metadata: {
          dynamicSamplingContext: {
            environment: 'production',
            public_key: 'dogsarebadatkeepingsecrets',
            release: '1.0.0',
            sample_rate: '1',
            trace_id: '1234567890abcdef1234567890abcdef',
            transaction: 'dogpark',
            user_segment: 'segmentA',
          },
          source: 'url',
        },
      },
      expect.any(Function),
      expect.any(Function),
    );
  });
});
