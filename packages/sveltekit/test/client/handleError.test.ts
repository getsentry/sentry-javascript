import { Scope } from '@sentry/svelte';
// For now disable the import/no-unresolved rule, because we don't have a way to
// tell eslint that we are only importing types from the @sveltejs/kit package without
// adding a custom resolver, which will take too much time.
// eslint-disable-next-line import/no-unresolved
import type { HandleClientError, NavigationEvent } from '@sveltejs/kit';
import { vi } from 'vitest';

import { handleErrorWithSentry } from '../../src/client/handleError';

const mockCaptureException = vi.fn();
let mockScope = new Scope();

vi.mock('@sentry/svelte', async () => {
  const original = (await vi.importActual('@sentry/core')) as any;
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

function handleError(_input: { error: unknown; event: NavigationEvent }): ReturnType<HandleClientError> {
  return {
    message: 'Whoops!',
  };
}

const navigationEvent: NavigationEvent = {
  params: {
    id: '123',
  },
  route: {
    id: 'users/[id]',
  },
  url: new URL('http://example.org/users/123'),
};

describe('handleError', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockAddExceptionMechanism.mockClear();
    mockScope = new Scope();
  });

  it('works when a handleError func is not provided', async () => {
    const wrappedHandleError = handleErrorWithSentry();
    const mockError = new Error('test');
    const returnVal = await wrappedHandleError({ error: mockError, event: navigationEvent });

    expect(returnVal).not.toBeDefined();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(mockError, expect.any(Function));
  });

  it('calls captureException', async () => {
    const wrappedHandleError = handleErrorWithSentry(handleError);
    const mockError = new Error('test');
    const returnVal = (await wrappedHandleError({ error: mockError, event: navigationEvent })) as any;

    expect(returnVal.message).toEqual('Whoops!');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(mockError, expect.any(Function));
  });

  it('adds an exception mechanism', async () => {
    const addEventProcessorSpy = vi.spyOn(mockScope, 'addEventProcessor').mockImplementationOnce(callback => {
      void callback({}, { event_id: 'fake-event-id' });
      return mockScope;
    });

    const wrappedHandleError = handleErrorWithSentry(handleError);
    const mockError = new Error('test');
    await wrappedHandleError({ error: mockError, event: navigationEvent });

    expect(addEventProcessorSpy).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledWith({}, { handled: false, type: 'sveltekit' });
  });
});
