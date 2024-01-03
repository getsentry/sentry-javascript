import * as SentryCore from '@sentry/core';

import { cron } from '../src';
import type { CronJob, CronJobParams } from '../src/cron/cron';

describe('cron', () => {
  let withMonitorSpy: jest.SpyInstance;

  beforeEach(() => {
    withMonitorSpy = jest.spyOn(SentryCore, 'withMonitor');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cron', () => {
    class CronJobMock {
      constructor(
        cronTime: CronJobParams['cronTime'],
        onTick: CronJobParams['onTick'],
        _onComplete?: CronJobParams['onComplete'],
        _start?: CronJobParams['start'],
        _timeZone?: CronJobParams['timeZone'],
        _context?: CronJobParams['context'],
        _runOnInit?: CronJobParams['runOnInit'],
        _utcOffset?: CronJobParams['utcOffset'],
        _unrefTimeout?: CronJobParams['unrefTimeout'],
      ) {
        expect(cronTime).toBe('* * * Jan,Sep Sun');
        expect(onTick).toBeInstanceOf(Function);
        setImmediate(() => onTick(undefined, undefined));
      }

      static from(params: CronJobParams): CronJob {
        return new CronJobMock(
          params.cronTime,
          params.onTick,
          params.onComplete,
          params.start,
          params.timeZone,
          params.context,
          params.runOnInit,
          params.utcOffset,
          params.unrefTimeout,
        );
      }
    }

    test('new CronJob()', done => {
      expect.assertions(4);

      const CronJobWithCheckIn = cron.instrumentCron(CronJobMock, 'my-cron-job');

      const _ = new CronJobWithCheckIn('* * * Jan,Sep Sun', () => {
        expect(withMonitorSpy).toHaveBeenCalledTimes(1);
        expect(withMonitorSpy).toHaveBeenLastCalledWith('my-cron-job', expect.anything(), {
          schedule: { type: 'crontab', value: '* * * 1,9 0' },
        });
        done();
      });
    });

    test('CronJob.from()', done => {
      expect.assertions(4);

      const CronJobWithCheckIn = cron.instrumentCron(CronJobMock, 'my-cron-job');

      const _ = CronJobWithCheckIn.from({
        cronTime: '* * * Jan,Sep Sun',
        onTick: () => {
          expect(withMonitorSpy).toHaveBeenCalledTimes(1);
          expect(withMonitorSpy).toHaveBeenLastCalledWith('my-cron-job', expect.anything(), {
            schedule: { type: 'crontab', value: '* * * 1,9 0' },
          });
          done();
        },
      });
    });
  });
});
