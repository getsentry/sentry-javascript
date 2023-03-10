import { Scope } from '@sentry/node';
// For now disable the import/no-unresolved rule, because we don't have a way to
// tell eslint that we are only importing types from the @sveltejs/kit package without
// adding a custom resolver, which will take too much time.
// eslint-disable-next-line import/no-unresolved
import type { HandleServerError, RequestEvent } from '@sveltejs/kit';

import { wrapHandleErrorWithSentry } from '../../src/server/handleError';

const mockCaptureException = jest.fn();
let mockScope = new Scope();

jest.mock('@sentry/node', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    captureException: (err: unknown, cb: (arg0: unknown) => unknown) => {
      cb(mockScope);
      mockCaptureException(err, cb);
      return original.captureException(err, cb);
    },
  };
});

const mockAddExceptionMechanism = jest.fn();

jest.mock('@sentry/utils', () => {
  const original = jest.requireActual('@sentry/utils');
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
    const wrappedHandleError = wrapHandleErrorWithSentry();
    const mockError = new Error('test');
    const returnVal = await wrappedHandleError({ error: mockError, event: requestEvent });

    expect(returnVal).not.toBeDefined();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(mockError, expect.any(Function));
  });

  it('calls captureException', async () => {
    const wrappedHandleError = wrapHandleErrorWithSentry(handleError);
    const mockError = new Error('test');
    const returnVal = await wrappedHandleError({ error: mockError, event: requestEvent });

    expect(returnVal!.message).toEqual('Whoops!');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(mockError, expect.any(Function));
  });

  it('adds an exception mechanism', async () => {
    const addEventProcessorSpy = jest.spyOn(mockScope, 'addEventProcessor').mockImplementationOnce(callback => {
      void callback({}, { event_id: 'fake-event-id' });
      return mockScope;
    });

    const wrappedHandleError = wrapHandleErrorWithSentry(handleError);
    const mockError = new Error('test');
    await wrappedHandleError({ error: mockError, event: requestEvent });

    expect(addEventProcessorSpy).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledWith({}, { handled: false, type: 'sveltekit' });
  });
});
