import { vi } from 'vitest';

import { handleBeforeSendEvent } from '../../../src/coreHandlers/handleBeforeSendEvent';
import type { ReplayContainer } from '../../../src/replay';
import { Error } from '../../fixtures/error';
import { resetSdkMock } from '../../mocks/resetSdkMock';
import { useFakeTimers } from '../../utils/use-fake-timers';

useFakeTimers();
let replay: ReplayContainer;

describe('Integration | coreHandlers | handleBeforeSendEvent', () => {
  afterEach(() => {
    replay.stop();
  });

  it('adds a hydration breadcrumb on development hydration error', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));

    const handler = handleBeforeSendEvent(replay);
    const addBreadcrumbSpy = vi.spyOn(replay, 'throttledAddEvent');

    const error = Error();
    error.exception.values[0]!.value =
      'Text content does not match server-rendered HTML. Warning: Text content did not match.';
    handler(error);

    expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    expect(addBreadcrumbSpy).toHaveBeenCalledWith({
      data: {
        payload: {
          category: 'replay.hydrate-error',
          data: { url: 'http://localhost:3000/' },
          timestamp: expect.any(Number),
          type: 'default',
        },
        tag: 'breadcrumb',
      },
      timestamp: expect.any(Number),
      type: 5,
    });
  });

  it('adds a hydration breadcrumb on production hydration error', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));

    const handler = handleBeforeSendEvent(replay);
    const addBreadcrumbSpy = vi.spyOn(replay, 'throttledAddEvent');

    const error = Error();
    error.exception.values[0]!.value = 'https://reactjs.org/docs/error-decoder.html?invariant=423';
    handler(error);

    expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    expect(addBreadcrumbSpy).toHaveBeenCalledWith({
      data: {
        payload: {
          category: 'replay.hydrate-error',
          data: { url: 'http://localhost:3000/' },
          timestamp: expect.any(Number),
          type: 'default',
        },
        tag: 'breadcrumb',
      },
      timestamp: expect.any(Number),
      type: 5,
    });
  });
});
