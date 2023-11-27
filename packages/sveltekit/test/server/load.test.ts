import { addTracingExtensions } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import type { Load, ServerLoad } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { vi } from 'vitest';

import { wrapLoadWithSentry, wrapServerLoadWithSentry } from '../../src/server/load';

const mockCaptureException = vi.spyOn(SentryNode, 'captureException').mockImplementation(() => 'xx');

const mockStartSpan = vi.fn();

vi.mock('@sentry/core', async () => {
  const original = (await vi.importActual('@sentry/core')) as any;
  return {
    ...original,
    startSpan: (...args: unknown[]) => {
      mockStartSpan(...args);
      return original.startSpan(...args);
    },
  };
});

function getById(_id?: string) {
  throw new Error('error');
}

function getLoadArgs() {
  return {
    params: { id: '123' },
    route: {
      id: '/users/[id]',
    },
    url: new URL('http://localhost:3000/users/123'),
  };
}

function getLoadArgsWithoutRoute() {
  return {
    params: { id: '123' },
    url: new URL('http://localhost:3000/users/123'),
  };
}

function getServerOnlyArgs() {
  return {
    ...getLoadArgs(),
    request: {
      method: 'GET',
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
}

function getServerArgsWithoutTracingHeaders() {
  return {
    ...getLoadArgs(),
    request: {
      method: 'GET',
      headers: {
        get: (_: string) => {
          return null;
        },
      },
    },
  };
}

function getServerArgsWithoutBaggageHeader() {
  return {
    ...getLoadArgs(),
    request: {
      method: 'GET',
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
}

beforeAll(() => {
  addTracingExtensions();
});

afterEach(() => {
  mockCaptureException.mockClear();
  mockStartSpan.mockClear();
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
    const res = wrappedLoad(getLoadArgs());
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
      const res = wrappedLoad(getLoadArgs());
      await expect(res).rejects.toThrow();

      expect(mockCaptureException).toHaveBeenCalledTimes(times);
    });
  });

  it("doesn't call captureException for thrown `Redirect`s", async () => {
    async function load(_params: any): Promise<ReturnType<Load>> {
      throw redirect(300, 'other/route');
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad(getLoadArgs());
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('adds an exception mechanism', async () => {
    async function load({ params }) {
      return {
        post: getById(params.id),
      };
    }

    const wrappedLoad = sentryLoadWrapperFn(load);
    const res = wrappedLoad(getServerOnlyArgs());
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      mechanism: { handled: false, type: 'sveltekit', data: { function: 'load' } },
    });
  });
});
describe('wrapLoadWithSentry calls trace', () => {
  async function load({ params }): Promise<ReturnType<Load>> {
    return {
      post: params.id,
    };
  }

  it('with the context of the universal load function', async () => {
    const wrappedLoad = wrapLoadWithSentry(load);
    await wrappedLoad(getLoadArgs());

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
    expect(mockStartSpan).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.load',
        origin: 'auto.function.sveltekit',
        name: '/users/[id]',
        status: 'ok',
        metadata: {
          source: 'route',
        },
      },
      expect.any(Function),
    );
  });

  it('falls back to the raw url if `event.route.id` is not available', async () => {
    const wrappedLoad = wrapLoadWithSentry(load);
    await wrappedLoad(getLoadArgsWithoutRoute());

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
    expect(mockStartSpan).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.load',
        origin: 'auto.function.sveltekit',
        name: '/users/123',
        status: 'ok',
        metadata: {
          source: 'url',
        },
      },
      expect.any(Function),
    );
  });

  it("doesn't wrap load more than once if the wrapper was applied multiple times", async () => {
    const wrappedLoad = wrapLoadWithSentry(wrapLoadWithSentry(wrapLoadWithSentry(load)));
    await wrappedLoad(getLoadArgs());

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
  });
});

describe('wrapServerLoadWithSentry calls trace', () => {
  async function serverLoad({ params }): Promise<ReturnType<ServerLoad>> {
    return {
      post: params.id,
    };
  }

  it('attaches trace data if available', async () => {
    const wrappedLoad = wrapServerLoadWithSentry(serverLoad);
    await wrappedLoad(getServerOnlyArgs());

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
    expect(mockStartSpan).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.server.load',
        origin: 'auto.function.sveltekit',
        name: '/users/[id]',
        parentSampled: true,
        parentSpanId: '1234567890abcdef',
        status: 'ok',
        traceId: '1234567890abcdef1234567890abcdef',
        data: {
          'http.method': 'GET',
        },
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
    );
  });

  it("doesn't attach trace data if it's not available", async () => {
    const wrappedLoad = wrapServerLoadWithSentry(serverLoad);
    await wrappedLoad(getServerArgsWithoutTracingHeaders());

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
    expect(mockStartSpan).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.server.load',
        origin: 'auto.function.sveltekit',
        name: '/users/[id]',
        status: 'ok',
        data: {
          'http.method': 'GET',
        },
        metadata: {
          source: 'route',
        },
      },
      expect.any(Function),
    );
  });

  it("doesn't attach the DSC data if the baggage header not available", async () => {
    const wrappedLoad = wrapServerLoadWithSentry(serverLoad);
    await wrappedLoad(getServerArgsWithoutBaggageHeader());

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
    expect(mockStartSpan).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.server.load',
        origin: 'auto.function.sveltekit',
        name: '/users/[id]',
        parentSampled: true,
        parentSpanId: '1234567890abcdef',
        status: 'ok',
        traceId: '1234567890abcdef1234567890abcdef',
        data: {
          'http.method': 'GET',
        },
        metadata: {
          dynamicSamplingContext: {},
          source: 'route',
        },
      },
      expect.any(Function),
    );
  });

  it('falls back to the raw url if `event.route.id` is not available', async () => {
    const event = getServerOnlyArgs();
    // @ts-expect-error - this is fine (just tests here)
    delete event.route;
    const wrappedLoad = wrapServerLoadWithSentry(serverLoad);
    await wrappedLoad(event);

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
    expect(mockStartSpan).toHaveBeenCalledWith(
      {
        op: 'function.sveltekit.server.load',
        origin: 'auto.function.sveltekit',
        name: '/users/123',
        parentSampled: true,
        parentSpanId: '1234567890abcdef',
        status: 'ok',
        traceId: '1234567890abcdef1234567890abcdef',
        data: {
          'http.method': 'GET',
        },
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
    );
  });

  it("doesn't wrap server load more than once if the wrapper was applied multiple times", async () => {
    const wrappedLoad = wrapServerLoadWithSentry(wrapServerLoadWithSentry(serverLoad));
    await wrappedLoad(getServerOnlyArgs());

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
  });

  it("doesn't invoke the proxy set on `event.route`", async () => {
    const event = getServerOnlyArgs();

    // simulates SvelteKit adding a proxy to `event.route`
    // https://github.com/sveltejs/kit/blob/e133aba479fa9ba0e7f9e71512f5f937f0247e2c/packages/kit/src/runtime/server/page/load_data.js#L111C3-L124
    const proxyFn = vi.fn((target: { id: string }, key: string | symbol): any => {
      return target[key];
    });

    event.route = new Proxy(event.route, {
      get: proxyFn,
    });

    const wrappedLoad = wrapServerLoadWithSentry(serverLoad);
    await wrappedLoad(event);

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
    expect(mockStartSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'function.sveltekit.server.load',
        name: '/users/[id]', // <-- this shows that the route was still accessed
      }),
      expect.any(Function),
    );

    expect(proxyFn).not.toHaveBeenCalled();
  });
});
