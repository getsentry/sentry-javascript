import { captureException } from '@sentry/core';

import type { ReplayContainer } from '../../src/replay';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | hydration', () => {
  let replay: ReplayContainer;

  beforeEach(async () => {
    ({ replay } = await resetSdkMock({}));
  });

  it('adds a hydration breadcrumb on error', async () => {
    // @ts-expect-error private method
    const breadcrumbSpy = jest.spyOn(replay, '_createCustomBreadcrumb');
    captureException(new Error('Text content did not match. Server: "A" Client: "B"'));

    jest.runAllTimers();

    expect(breadcrumbSpy).toHaveBeenCalledWith({
      category: 'replay.hydrate',
      data: {},
    });
  });
});
