import * as SentrySvelte from '@sentry/svelte';
import type { Load } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { vi } from 'vitest';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { wrapLoadWithSentry } from '../../src/client/load';

const mockCaptureException = vi.spyOn(SentrySvelte, 'captureException').mockImplementation(() => 'xx');

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

const MOCK_LOAD_ARGS: any = {
  params: { id: '123' },
  route: {
    id: '/users/[id]',
  },
  url: new URL('http://localhost:3000/users/123'),
};

describe('wrapLoadWithSentry', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockStartSpan.mockClear();
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

  it.each([400, 404, 499])("doesn't call captureException for thrown `HttpError`s with status %s", async status => {
    async function load(_: Parameters<Load>[0]): Promise<ReturnType<Load>> {
      throw { status, body: 'error' };
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad(MOCK_LOAD_ARGS);
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it.each([500, 501, 599])('calls captureException for thrown `HttpError`s with status %s', async status => {
    async function load(_: Parameters<Load>[0]): Promise<ReturnType<Load>> {
      throw { status, body: 'error' };
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad(MOCK_LOAD_ARGS);
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
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

      expect(mockStartSpan).toHaveBeenCalledTimes(1);
      expect(mockStartSpan).toHaveBeenCalledWith(
        {
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.sveltekit',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          },
          op: 'function.sveltekit.load',
          name: '/users/[id]',
        },
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

      expect(mockStartSpan).toHaveBeenCalledTimes(1);
      expect(mockStartSpan).toHaveBeenCalledWith(
        {
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.sveltekit',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          },
          op: 'function.sveltekit.load',
          name: '/users/123',
        },
        expect.any(Function),
      );
    });
  });

  it('adds an exception mechanism', async () => {
    async function load({ params }: Parameters<Load>[0]): Promise<ReturnType<Load>> {
      return {
        post: getById(params.id),
      };
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad(MOCK_LOAD_ARGS);
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      mechanism: { handled: false, type: 'sveltekit', data: { function: 'load' } },
    });
  });

  it("doesn't wrap load more than once if the wrapper was applied multiple times", async () => {
    async function load({ params }: Parameters<Load>[0]): Promise<ReturnType<Load>> {
      return {
        post: params.id,
      };
    }

    const wrappedLoad = wrapLoadWithSentry(wrapLoadWithSentry(load));
    await wrappedLoad(MOCK_LOAD_ARGS);

    expect(mockStartSpan).toHaveBeenCalledTimes(1);
  });
});
