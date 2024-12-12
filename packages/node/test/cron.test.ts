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

      new CronJobWithCheckIn(
        '* * * Jan,Sep Sun',
        () => {
          expect(withMonitorSpy).toHaveBeenCalledTimes(1);
          expect(withMonitorSpy).toHaveBeenLastCalledWith('my-cron-job', expect.anything(), {
            schedule: { type: 'crontab', value: '* * * 1,9 0' },
            timezone: 'America/Los_Angeles',
          });
          done();
        },
        undefined,
        true,
        'America/Los_Angeles',
      );
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

    test('throws with multiple jobs same name', () => {
      const CronJobWithCheckIn = cron.instrumentCron(CronJobMock, 'my-cron-job');

      CronJobWithCheckIn.from({
        cronTime: '* * * Jan,Sep Sun',
        onTick: () => {
          //
        },
      });

      expect(() => {
        CronJobWithCheckIn.from({
          cronTime: '* * * Jan,Sep Sun',
          onTick: () => {
            //
          },
        });
      }).toThrowError("A job named 'my-cron-job' has already been scheduled");
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
        // @ts-expect-error Initially missing name
        cronWithCheckIn.schedule('* * * * *', () => {
          //
        });
      }).toThrowError('Missing "name" for scheduled job. A name is required for Sentry check-in monitoring.');
    });
  });

  describe('node-schedule', () => {
    test('calls withMonitor', done => {
      expect.assertions(5);

      class NodeScheduleMock {
        scheduleJob(
          nameOrExpression: string | Date | object,
          expressionOrCallback: string | Date | object | (() => void),
          callback: () => void,
        ): unknown {
          expect(nameOrExpression).toBe('my-cron-job');
          expect(expressionOrCallback).toBe('* * * Jan,Sep Sun');
          expect(callback).toBeInstanceOf(Function);
          return callback();
        }
      }

      const scheduleWithCheckIn = cron.instrumentNodeSchedule(new NodeScheduleMock());

      scheduleWithCheckIn.scheduleJob('my-cron-job', '* * * Jan,Sep Sun', () => {
        expect(withMonitorSpy).toHaveBeenCalledTimes(1);
        expect(withMonitorSpy).toHaveBeenLastCalledWith('my-cron-job', expect.anything(), {
          schedule: { type: 'crontab', value: '* * * 1,9 0' },
        });
        done();
      });
    });

    test('throws without crontab string', () => {
      class NodeScheduleMock {
        scheduleJob(_: string, __: string | Date, ___: () => void): unknown {
          return undefined;
        }
      }

      const scheduleWithCheckIn = cron.instrumentNodeSchedule(new NodeScheduleMock());

      expect(() => {
        scheduleWithCheckIn.scheduleJob('my-cron-job', new Date(), () => {
          //
        });
      }).toThrowError(
        "Automatic instrumentation of 'node-schedule' requires the first parameter of 'scheduleJob' to be a job name string and the second parameter to be a crontab string",
      );
    });

    test('throws without job name', () => {
      class NodeScheduleMock {
        scheduleJob(_: string, __: () => void): unknown {
          return undefined;
        }
      }

      const scheduleWithCheckIn = cron.instrumentNodeSchedule(new NodeScheduleMock());

      expect(() => {
        scheduleWithCheckIn.scheduleJob('* * * * *', () => {
          //
        });
      }).toThrowError(
        "Automatic instrumentation of 'node-schedule' requires the first parameter of 'scheduleJob' to be a job name string and the second parameter to be a crontab string",
      );
    });
  });
});
