import * as SentryCore from '@sentry/core';

import { cron } from '../src';
import type { CronJob, CronJobParams } from '../src/cron/cron';
import type { NodeCron, NodeCronOptions } from '../src/cron/node-cron';

describe('cron check-ins', () => {
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

      new CronJobWithCheckIn('* * * Jan,Sep Sun', () => {
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

      CronJobWithCheckIn.from({
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
