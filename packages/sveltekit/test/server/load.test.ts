import { Scope } from '@sentry/node';
import type { ServerLoad } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { vi } from 'vitest';

import { wrapLoadWithSentry } from '../../src/server/load';

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

function getById(_id?: string) {
  throw new Error('error');
}

describe('wrapLoadWithSentry', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockAddExceptionMechanism.mockClear();
    mockScope = new Scope();
  });

  it('calls captureException', async () => {
    async function load({ params }: Parameters<ServerLoad>[0]): Promise<ReturnType<ServerLoad>> {
      return {
        post: getById(params.id),
      };
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad({ params: { id: '1' } } as any);
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
      async function load({ params }: Parameters<ServerLoad>[0]): Promise<ReturnType<ServerLoad>> {
        throw error(code, params.id);
      }

      const wrappedLoad = wrapLoadWithSentry(load);
      const res = wrappedLoad({ params: { id: '1' } } as any);
      await expect(res).rejects.toThrow();

      expect(mockCaptureException).toHaveBeenCalledTimes(times);
    });
  });

  it('adds an exception mechanism', async () => {
    const addEventProcessorSpy = vi.spyOn(mockScope, 'addEventProcessor').mockImplementationOnce(callback => {
      void callback({}, { event_id: 'fake-event-id' });
      return mockScope;
    });

    async function load({ params }: Parameters<ServerLoad>[0]): Promise<ReturnType<ServerLoad>> {
      return {
        post: getById(params.id),
      };
    }

    const wrappedLoad = wrapLoadWithSentry(load);
    const res = wrappedLoad({ params: { id: '1' } } as any);
    await expect(res).rejects.toThrow();

    expect(addEventProcessorSpy).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledWith(
      {},
      { handled: false, type: 'instrument', data: { function: 'load' } },
    );
  });
});
