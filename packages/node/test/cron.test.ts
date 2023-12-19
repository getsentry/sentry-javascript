import * as SentryCore from '@sentry/core';

import type { NodeCron, NodeCronOptions } from '../src/cron/node-cron';
import { instrumentNodeCron } from '../src/cron/node-cron';

describe('cron', () => {
  let withMonitorSpy: jest.SpyInstance;

  beforeEach(() => {
    withMonitorSpy = jest.spyOn(SentryCore, 'withMonitor');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('node-cron', done => {
    const nodeCron: NodeCron = {
      schedule: (expression: string, callback: () => void, options?: NodeCronOptions): unknown => {
        expect(expression).toBe('* * * Jan,Sep Sun');
        expect(callback).toBeInstanceOf(Function);
        expect(options?.name).toBe('my-cron-job');
        return callback();
      },
    };

    const cronWithCheckIn = instrumentNodeCron(nodeCron);

    cronWithCheckIn.schedule(
      '* * * Jan,Sep Sun',
      () => {
        expect(withMonitorSpy).toHaveBeenCalledTimes(1);
        expect(withMonitorSpy).toHaveBeenLastCalledWith('my-cron-job', expect.anything(), {
          schedule: { type: 'crontab', value: '* * * 1,9 0' },
        });
        done();
      },
      { name: 'my-cron-job' },
    );
  });
});
