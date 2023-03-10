import { Scope } from '@sentry/node';
// eslint-disable-next-line import/no-unresolved
import type { ServerLoad } from '@sveltejs/kit';

import { wrapLoadWithSentry } from '../../src/server/load';

const mockCaptureException = jest.fn();
let mockScope = new Scope();

jest.mock('@sentry/node', () => {
  const original = jest.requireActual('@sentry/node');
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

function getById(_id?: string) {
  throw new Error('error');
}

async function erroringLoad({ params }: Parameters<ServerLoad>[0]): Promise<ReturnType<ServerLoad>> {
  return {
    post: getById(params.id),
  };
}

describe('wrapLoadWithSentry', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockAddExceptionMechanism.mockClear();
    mockScope = new Scope();
  });

  it('calls captureException', async () => {
    const wrappedLoad = wrapLoadWithSentry(erroringLoad);
    const res = wrappedLoad({ params: { id: '1' } } as any);
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('adds an exception mechanism', async () => {
    const addEventProcessorSpy = jest.spyOn(mockScope, 'addEventProcessor').mockImplementationOnce(callback => {
      void callback({}, { event_id: 'fake-event-id' });
      return mockScope;
    });

    const wrappedLoad = wrapLoadWithSentry(erroringLoad);
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
