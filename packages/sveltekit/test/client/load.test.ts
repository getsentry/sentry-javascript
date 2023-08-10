import { addTracingExtensions, Scope } from '@sentry/svelte';
import type { Load } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { vi } from 'vitest';

import { wrapLoadWithSentry } from '../../src/client/load';

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

beforeAll(() => {
  addTracingExtensions();
});

describe('wrapLoadWithSentry', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockAddExceptionMechanism.mockClear();
    mockTrace.mockClear();
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
          origin: 'auto.function.sveltekit',
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

    it("falls back to the raw URL if `even.route.id` isn't available", async () => {
      async function load({ params }: Parameters<Load>[0]): Promise<ReturnType<Load>> {
        return {
          post: params.id,
        };
      }
      const wrappedLoad = wrapLoadWithSentry(load);

      const event = { ...MOCK_LOAD_ARGS };
      delete event.route.id;

      await wrappedLoad(MOCK_LOAD_ARGS);

      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(mockTrace).toHaveBeenCalledWith(
        {
          op: 'function.sveltekit.load',
          origin: 'auto.ui.sveltekit',
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
