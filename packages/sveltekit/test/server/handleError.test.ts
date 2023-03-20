import { Scope } from '@sentry/node';
import type { HandleServerError, RequestEvent } from '@sveltejs/kit';
import { vi } from 'vitest';

import { handleErrorWithSentry } from '../../src/server/handleError';

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

function handleError(_input: { error: unknown; event: RequestEvent }): ReturnType<HandleServerError> {
  return {
    message: 'Whoops!',
  };
}

const requestEvent = {} as RequestEvent;

describe('handleError', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockAddExceptionMechanism.mockClear();
    mockScope = new Scope();
  });

  it('works when a handleError func is not provided', async () => {
    const wrappedHandleError = handleErrorWithSentry();
    const mockError = new Error('test');
    const returnVal = await wrappedHandleError({ error: mockError, event: requestEvent });

    expect(returnVal).not.toBeDefined();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(mockError, expect.any(Function));
  });

  it('calls captureException', async () => {
    const wrappedHandleError = handleErrorWithSentry(handleError);
    const mockError = new Error('test');
    const returnVal = (await wrappedHandleError({ error: mockError, event: requestEvent })) as any;

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
    await wrappedHandleError({ error: mockError, event: requestEvent });

    expect(addEventProcessorSpy).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledWith({}, { handled: false, type: 'sveltekit' });
  });
});
