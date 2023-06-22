import * as sentryCore from '@sentry/core';
import { addTracingExtensions, Scope } from '@sentry/svelte';
import { baggageHeaderToDynamicSamplingContext } from '@sentry/utils';
import type { Load } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { vi } from 'vitest';

import { wrapLoadWithSentry } from '../../src/client/load';

const SENTRY_TRACE_HEADER = '1234567890abcdef1234567890abcdef-1234567890abcdef-1';
const BAGGAGE_HEADER =
  'sentry-environment=production,sentry-release=1.0.0,sentry-transaction=dogpark,' +
  'sentry-user_segment=segmentA,sentry-public_key=dogsarebadatkeepingsecrets,' +
  'sentry-trace_id=1234567890abcdef1234567890abcdef,sentry-sample_rate=1';

const mockCaptureException = vi.fn();
let mockScope = new Scope();

vi.mock('@sentry/svelte', async () => {
  const original = (await vi.importActual('@sentry/svelte')) as any;
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

const mockedBrowserTracing = {
  options: {
    tracePropagationTargets: ['example.com', /^\\/],
    traceFetch: true,
    shouldCreateSpanForRequest: undefined as undefined | (() => boolean),
  },
};

const mockedBreadcrumbs = {
  options: {
    fetch: true,
  },
};

const mockedGetIntegrationById = vi.fn(id => {
  if (id === 'BrowserTracing') {
    return mockedBrowserTracing;
  } else if (id === 'Breadcrumbs') {
    return mockedBreadcrumbs;
  }
  return undefined;
});

const mockedGetClient = vi.fn(() => {
  return {
    getIntegrationById: mockedGetIntegrationById,
  };
});

vi.mock('@sentry/core', async () => {
  const original = (await vi.importActual('@sentry/core')) as any;
  return {
    ...original,
    trace: (...args: unknown[]) => {
      mockTrace(...args);
      return original.trace(...args);
    },
    getCurrentHub: () => {
      return {
        getClient: mockedGetClient,
        getScope: () => {
          return {
            getSpan: () => {
              return {
                transaction: {
                  getDynamicSamplingContext: () => {
                    return baggageHeaderToDynamicSamplingContext(BAGGAGE_HEADER);
                  },
                },
                toTraceparent: () => {
                  return SENTRY_TRACE_HEADER;
                },
              };
            },
          };
        },
        addBreadcrumb: mockedAddBreadcrumb,
      };
    },
  };
});

const mockAddExceptionMechanism = vi.fn();
const mockedAddBreadcrumb = vi.fn();

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

const mockedSveltekitFetch = vi.fn().mockReturnValue(Promise.resolve({ status: 200 }));

const MOCK_LOAD_ARGS: any = {
  params: { id: '123' },
  route: {
    id: '/users/[id]',
  },
  url: new URL('http://localhost:3000/users/123'),
  request: {
    headers: {
      get: (key: string) => {
        if (key === 'sentry-trace') {
          return SENTRY_TRACE_HEADER;
        }

        if (key === 'baggage') {
          return BAGGAGE_HEADER;
        }

        return null;
      },
    },
  },
  fetch: mockedSveltekitFetch,
};

beforeAll(() => {
  addTracingExtensions();
});

describe('wrapLoadWithSentry', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockAddExceptionMechanism.mockClear();
    mockTrace.mockClear();
    mockedGetIntegrationById.mockClear();
    mockedSveltekitFetch.mockClear();
    mockedAddBreadcrumb.mockClear();
    mockScope = new Scope();
  });

  it('calls captureException', async () => {
    async function load({ params }: Parameters<Load>[0]): Promise<ReturnType<Load>> {
      return {
        post: getById(params.id),
      };
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad(MOCK_LOAD_ARGS);
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
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

  describe('calls trace function', async () => {
    it('creates a load span', async () => {
      async function load({ params }: Parameters<Load>[0]): Promise<ReturnType<Load>> {
        return {
          post: params.id,
        };
      }

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

    describe.each([
      [
        'fetch call with fragment and params',
        ['example.com/api/users/?id=123#testfragment'],
        {
          op: 'http.client',
          name: 'GET example.com/api/users/',
          data: {
            'http.method': 'GET',
            url: 'example.com/api/users/',
            'http.hash': 'testfragment',
            'http.query': 'id=123',
          },
        },
      ],
      [
        'fetch call with options object',
        ['example.com/api/users/?id=123#testfragment', { method: 'POST' }],
        {
          op: 'http.client',
          name: 'POST example.com/api/users/',
          data: {
            'http.method': 'POST',
            url: 'example.com/api/users/',
            'http.hash': 'testfragment',
            'http.query': 'id=123',
          },
        },
      ],
      [
        'fetch call with custom headers in options ',
        ['example.com/api/users/?id=123#testfragment', { method: 'POST', headers: { 'x-my-header': 'some value' } }],
        {
          op: 'http.client',
          name: 'POST example.com/api/users/',
          data: {
            'http.method': 'POST',
            url: 'example.com/api/users/',
            'http.hash': 'testfragment',
            'http.query': 'id=123',
          },
        },
      ],
      [
        'fetch call with a Request object ',
        [{ url: '/api/users?id=123', headers: { 'x-my-header': 'value' } } as unknown as Request],
        {
          op: 'http.client',
          name: 'GET /api/users',
          data: {
            'http.method': 'GET',
            url: '/api/users',
            'http.query': 'id=123',
          },
        },
      ],
    ])('instruments fetch (%s)', (_, originalFetchArgs, spanCtx) => {
      beforeEach(() => {
        mockedBrowserTracing.options = {
          tracePropagationTargets: ['example.com', /^\//],
          traceFetch: true,
          shouldCreateSpanForRequest: undefined,
        };
      });

      const load = async ({ params, fetch }) => {
        await fetch(...originalFetchArgs);
        return {
          post: params.id,
        };
      };

      it('creates a fetch span and attaches tracing headers by default when event.fetch was called', async () => {
        const wrappedLoad = wrapLoadWithSentry(load);
        await wrappedLoad(MOCK_LOAD_ARGS);

        expect(mockTrace).toHaveBeenCalledTimes(2);
        expect(mockTrace).toHaveBeenNthCalledWith(
          1,
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
        expect(mockTrace).toHaveBeenNthCalledWith(2, spanCtx, expect.any(Function));

        const hasSecondArg = originalFetchArgs.length > 1;
        const expectedFetchArgs = [
          originalFetchArgs[0],
          {
            ...(hasSecondArg && (originalFetchArgs[1] as RequestInit)),
            headers: {
              // @ts-ignore that's fine
              ...(hasSecondArg && (originalFetchArgs[1].headers as RequestInit['headers'])),
              baggage: expect.any(String),
              'sentry-trace': expect.any(String),
            },
          },
        ];

        expect(mockedSveltekitFetch).toHaveBeenCalledWith(...expectedFetchArgs);
      });

      it("only creates a span but doesn't propagate headers if traceProgagationTargets don't match", async () => {
        const previousPropagationTargets = mockedBrowserTracing.options.tracePropagationTargets;
        mockedBrowserTracing.options.tracePropagationTargets = [];

        const wrappedLoad = wrapLoadWithSentry(load);
        await wrappedLoad(MOCK_LOAD_ARGS);

        expect(mockTrace).toHaveBeenCalledTimes(2);
        expect(mockTrace).toHaveBeenNthCalledWith(
          1,
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
        expect(mockTrace).toHaveBeenNthCalledWith(2, spanCtx, expect.any(Function));

        expect(mockedSveltekitFetch).toHaveBeenCalledWith(
          ...[originalFetchArgs[0], originalFetchArgs.length === 2 ? originalFetchArgs[1] : {}],
        );

        mockedBrowserTracing.options.tracePropagationTargets = previousPropagationTargets;
      });

      it("doesn't create a span nor propagate headers, if `Browsertracing.options.traceFetch` is false", async () => {
        mockedBrowserTracing.options.traceFetch = false;

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

        expect(mockedSveltekitFetch).toHaveBeenCalledWith(
          ...[originalFetchArgs[0], originalFetchArgs.length === 2 ? originalFetchArgs[1] : {}],
        );

        mockedBrowserTracing.options.traceFetch = true;
      });

      it("doesn't create a span nor propagate headers, if `shouldCreateSpanForRequest` returns false", async () => {
        mockedBrowserTracing.options.shouldCreateSpanForRequest = () => false;

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

        expect(mockedSveltekitFetch).toHaveBeenCalledWith(
          ...[originalFetchArgs[0], originalFetchArgs.length === 2 ? originalFetchArgs[1] : {}],
        );

        mockedBrowserTracing.options.shouldCreateSpanForRequest = () => true;
      });

      it('adds a breadcrumb for the fetch call', async () => {
        const wrappedLoad = wrapLoadWithSentry(load);
        await wrappedLoad(MOCK_LOAD_ARGS);

        expect(mockedAddBreadcrumb).toHaveBeenCalledWith(
          {
            category: 'fetch',
            data: {
              ...spanCtx.data,
              status_code: 200,
            },
            type: 'http',
          },
          {
            endTimestamp: expect.any(Number),
            input: [...originalFetchArgs],
            response: {
              status: 200,
            },
            startTimestamp: expect.any(Number),
          },
        );
      });

      it("doesn't add a breadcrumb if fetch breadcrumbs are deactivated in the integration", async () => {
        mockedBreadcrumbs.options.fetch = false;

        const wrappedLoad = wrapLoadWithSentry(load);
        await wrappedLoad(MOCK_LOAD_ARGS);

        expect(mockedAddBreadcrumb).not.toHaveBeenCalled();

        mockedBreadcrumbs.options.fetch = true;
      });
    });
  });

  it.each([
    ['is undefined', undefined],
    ["doesn't have a `getClientById` method", {}],
  ])("doesn't instrument fetch if the client %s", async (_, client) => {
    // @ts-expect-error: we're mocking the client
    mockedGetClient.mockImplementationOnce(() => client);

    async function load(_event: Parameters<Load>[0]): Promise<ReturnType<Load>> {
      return {
        msg: 'hi',
      };
    }
    const wrappedLoad = wrapLoadWithSentry(load);

    const originalFetch = MOCK_LOAD_ARGS.fetch;
    await wrappedLoad(MOCK_LOAD_ARGS);

    expect(MOCK_LOAD_ARGS.fetch).toStrictEqual(originalFetch);

    expect(mockTrace).toHaveBeenCalledTimes(1);
  });

  it('adds an exception mechanism', async () => {
    const addEventProcessorSpy = vi.spyOn(mockScope, 'addEventProcessor').mockImplementationOnce(callback => {
      void callback({}, { event_id: 'fake-event-id' });
      return mockScope;
    });

    async function load({ params }: Parameters<Load>[0]): Promise<ReturnType<Load>> {
      return {
        post: getById(params.id),
      };
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad(MOCK_LOAD_ARGS);
    await expect(res).rejects.toThrow();

    expect(addEventProcessorSpy).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledWith(
      {},
      { handled: false, type: 'sveltekit', data: { function: 'load' } },
    );
  });

  it("doesn't wrap load more than once if the wrapper was applied multiple times", async () => {
    async function load({ params }: Parameters<Load>[0]): Promise<ReturnType<Load>> {
      return {
        post: params.id,
      };
    }

    const wrappedLoad = wrapLoadWithSentry(wrapLoadWithSentry(load));
    await wrappedLoad(MOCK_LOAD_ARGS);

    expect(mockTrace).toHaveBeenCalledTimes(1);
  });
});
