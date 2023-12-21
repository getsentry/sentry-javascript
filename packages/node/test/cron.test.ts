import * as SentryCore from '@sentry/core';

import { cron } from '../src';
import type { NodeCron, NodeCronOptions } from '../src/cron/node-cron';

describe('cron', () => {
  let withMonitorSpy: jest.SpyInstance;

  beforeEach(() => {
    withMonitorSpy = jest.spyOn(SentryCore, 'withMonitor');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('node-cron', () => {
    test('calls withMonitor', done => {
      expect.assertions(5);

      const nodeCron: NodeCron = {
        schedule: (expression: string, callback: () => void, options?: NodeCronOptions): unknown => {
          expect(expression).toBe('* * * Jan,Sep Sun');
          expect(callback).toBeInstanceOf(Function);
          expect(options?.name).toBe('my-cron-job');
          return callback();
        },
      };

      const cronWithCheckIn = cron.instrumentNodeCron(nodeCron);

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

    test('throws without supplied name', () => {
      const nodeCron: NodeCron = {
        schedule: (): unknown => {
          return undefined;
        },
      };

      const cronWithCheckIn = cron.instrumentNodeCron(nodeCron);

      expect(() => {
        cronWithCheckIn.schedule('* * * * *', () => {
          //
        });
      }).toThrowError('Missing "name" for scheduled job. A name is required for Sentry check-in monitoring.');
    });
  });
});
