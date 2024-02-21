import { BASE_TIMESTAMP } from '../../..';
import { addBreadcrumbEvent } from '../../../../src/coreHandlers/util/addBreadcrumbEvent';
import type { EventBufferArray } from '../../../../src/eventBuffer/EventBufferArray';
import { setupReplayContainer } from '../../../utils/setupReplayContainer';

jest.useFakeTimers();

describe('Unit | coreHandlers | util | addBreadcrumbEvent', function () {
  beforeEach(function () {
    jest.setSystemTime(BASE_TIMESTAMP);
  });

  it('handles circular references', async () => {
    const breadcrumb: any = {
      category: 'console',
      message: 'Test message',
      thisIsNull: null,
      thisIsUndefined: undefined,
      timestamp: BASE_TIMESTAMP / 1000,
    };
    breadcrumb['circular'] = breadcrumb;

    const replay = setupReplayContainer();
    addBreadcrumbEvent(replay, breadcrumb);

    await undefined;
    await undefined;
    await undefined;
    await undefined;
    await undefined;

    expect((replay.eventBuffer as EventBufferArray).events).toEqual([
      {
        type: 5,
        timestamp: BASE_TIMESTAMP,
        data: {
          tag: 'breadcrumb',
          payload: {
            category: 'console',
            message: 'Test message',
            thisIsNull: null,
            thisIsUndefined: undefined,
            circular: '[Circular ~]',
            timestamp: BASE_TIMESTAMP / 1000,
          },
        },
      },
    ]);
  });
});
