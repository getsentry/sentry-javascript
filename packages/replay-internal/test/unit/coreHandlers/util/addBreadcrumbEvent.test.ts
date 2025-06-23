/**
 * @vitest-environment jsdom
 */

import '../../../utils/mock-internal-setTimeout';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addBreadcrumbEvent } from '../../../../src/coreHandlers/util/addBreadcrumbEvent';
import type { EventBufferArray } from '../../../../src/eventBuffer/EventBufferArray';
import { BASE_TIMESTAMP } from '../../..';
import { setupReplayContainer } from '../../../utils/setupReplayContainer';

describe('Unit | coreHandlers | util | addBreadcrumbEvent', function () {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(function () {
    vi.setSystemTime(BASE_TIMESTAMP);
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
