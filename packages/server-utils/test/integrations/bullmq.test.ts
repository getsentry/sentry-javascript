import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from 'vitest';
import { instrumentWorker } from '../../src/integrations/bullmq';

function schedulerJob(id: string, repeat: Record<string, unknown>, attempt: Record<string, unknown> = {}): object {
  return {
    id: `repeat:${id}:1767225600000`,
    queueQualifiedName: 'bull:reports',
    timestamp: 1767225500000,
    name: 'job',
    repeatJobKey: id,
    attemptsStarted: 1,
    attemptsMade: 0,
    opts: { repeat: { count: 1, ...repeat } },
    ...attempt,
  };
}

// BullMQ sets `finishedOn` when a job fails for the last time.
function finalFailure(job: object): object {
  return Object.assign(job, { finishedOn: Date.now() });
}

describe('bullmqJobSchedulerIntegration', () => {
  let captureCheckInSpy: MockInstance;

  beforeEach(() => {
    captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn').mockReturnValue('check-in-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createWorker(
    opts: object = {},
  ): EventEmitter & { processFn: (job: object, ...args: unknown[]) => unknown; opts: object } {
    return Object.assign(new EventEmitter(), {
      name: 'reports',
      processFn: vi.fn((_job: object, ..._args: unknown[]) => 'result'),
      opts,
    });
  }

  function runJob(
    job: object,
    outcome: 'completed' | 'failed' = 'completed',
    worker = createWorker(),
    major: 5 | 6 = 5,
  ): void {
    instrumentWorker(worker, {}, major);
    worker.processFn(job);
    if (outcome === 'failed') {
      worker.emit('failed', finalFailure(job), new Error('boom'), 'active');
    } else {
      worker.emit('completed', job, 'result', 'active');
    }
  }

  function sentConfig(repeat: Record<string, unknown>, major: 5 | 6 = 5): unknown {
    runJob(schedulerJob('my-scheduler', repeat), 'completed', createWorker(), major);
    return captureCheckInSpy.mock.calls[0]?.[1];
  }

  function expectSkipped(repeat: Record<string, unknown>, major: 5 | 6 = 5): void {
    runJob(schedulerJob('my-scheduler', repeat), 'failed', createWorker(), major);
    const worker = createWorker();
    instrumentWorker(worker, {}, major);
    worker.emit('failed', finalFailure(schedulerJob('my-scheduler', repeat)), new Error('stalled'), 'active');
    expect(captureCheckInSpy).not.toHaveBeenCalled();
  }

  test('sends in_progress and ok check-ins with the scheduler id as slug', () => {
    runJob(schedulerJob('daily-report', { pattern: '0 9 * * 1-5', tz: 'Europe/Vienna' }));

    const config = { schedule: { type: 'crontab', value: '0 9 * * 1-5' }, timezone: 'Europe/Vienna' };
    expect(captureCheckInSpy).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: 'reports-daily-report', status: 'in_progress', checkInId: expect.stringMatching(/^[\da-f]{32}$/) },
      config,
    );
    const checkInId = captureCheckInSpy.mock.calls[0]?.[0].checkInId;
    expect(captureCheckInSpy).toHaveBeenNthCalledWith(
      2,
      { monitorSlug: 'reports-daily-report', status: 'ok', checkInId, duration: expect.any(Number) },
      config,
    );
  });

  test('sends an error check-in when the job fails', () => {
    runJob(schedulerJob('daily-report', { every: 60_000 }), 'failed');

    expect(captureCheckInSpy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }), expect.anything());
  });

  test.each([
    ['0 0 9 * * *', '0 9 * * *'],
    ['*/15 9-17 * * mon-fri', '*/15 9-17 * * 1-5'],
    ['0 0 1 JAN *', '0 0 1 1 *'],
    ['0 0 L * *', '0 0 L * *'],
    ['0 0 * * 5L', '0 0 * * 5L'],
    ['0 0 * * 1#2', '0 0 * * 1#2'],
    ['0 0 1 * 1', '0 0 1 * 1'],
    ['0 0 1 * 0-6', '0 0 1 * 0-6'],
    ['@daily', '0 0 * * *'],
  ])('converts pattern %j to crontab %j', (pattern, crontab) => {
    expect(sentConfig({ pattern, tz: 'UTC' })).toEqual({
      schedule: { type: 'crontab', value: crontab },
      timezone: 'UTC',
    });
  });

  test.each([
    '*/10 * * * * *',
    '0 0 ? * 1',
    '0 0 15W * *',
    '0 0 */2 * 1',
    '0 0 1 * */2',
    '0 0 1-31 * 1',
    '0 0 * * * * 2026',
  ])('skips pattern %j', pattern => {
    expectSkipped({ pattern, tz: 'UTC' });
  });

  test('uses the local time zone without tz', () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(sentConfig({ pattern: '0 * * * *' })).toEqual({
      schedule: { type: 'crontab', value: '0 * * * *' },
      timezone,
    });
  });

  test.each([true, 1])('uses UTC with utc: %j', utc => {
    expect(sentConfig({ pattern: '0 * * * *', tz: 'Europe/Vienna', utc })).toEqual({
      schedule: { type: 'crontab', value: '0 * * * *' },
      timezone: 'UTC',
    });
  });

  test('ignores utc on BullMQ 6', () => {
    expect(sentConfig({ pattern: '0 * * * *', tz: 'Europe/Vienna', utc: true }, 6)).toEqual({
      schedule: { type: 'crontab', value: '0 * * * *' },
      timezone: 'Europe/Vienna',
    });
  });

  test.each([
    ['0 9 * * 1', '0 9 * * 1#2'],
    ['0 0 9 * * mon', '0 9 * * 1#2'],
  ])('reads nthDayOfWeek with %j as %j', (pattern, crontab) => {
    expect(sentConfig({ pattern, nthDayOfWeek: 2, tz: 'UTC' })).toEqual({
      schedule: { type: 'crontab', value: crontab },
      timezone: 'UTC',
    });
  });

  test.each([
    ['0 9 * * *', 2],
    ['0 9 * * 1-5', 2],
    ['0 9 * * 1,3', 2],
    ['0 9 * * 5L', 2],
    ['0 9 * * 1#3', 2],
    ['0 9 1 * 1', 2],
    ['0 9 * * 1', 6],
    ['0 9 * * 1', '2'],
  ])('skips %j with nthDayOfWeek %j', (pattern, nthDayOfWeek) => {
    expectSkipped({ pattern, nthDayOfWeek, tz: 'UTC' });
  });

  test('ignores nthDayOfWeek on BullMQ 6', () => {
    expect(sentConfig({ pattern: '0 9 * * 1', nthDayOfWeek: 2, tz: 'UTC' }, 6)).toEqual({
      schedule: { type: 'crontab', value: '0 9 * * 1' },
      timezone: 'UTC',
    });
  });

  test('logs why a scheduler is not monitored once', () => {
    const logSpy = vi.spyOn(SentryCore.debug, 'log').mockImplementation(() => undefined);
    const worker = createWorker();
    instrumentWorker(worker, {}, 5);
    for (let run = 0; run < 2; run++) {
      const job = schedulerJob('limited', { every: 60_000, limit: 3 });
      worker.processFn(job);
      worker.emit('completed', job, 'result', 'active');
    }

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[BullMQJobScheduler] Not monitoring reports-limited: it sets a limit.');
  });

  test('skips a fixed UTC offset', () => {
    expectSkipped({ pattern: '0 * * * *', tz: 'UTC+5' });
  });

  test.each([
    [300_000, { type: 'interval', value: 5, unit: 'minute' }],
    [7_200_000, { type: 'interval', value: 2, unit: 'hour' }],
    [86_400_000, { type: 'interval', value: 1, unit: 'day' }],
  ])('converts every %j ms to an interval', (every, schedule) => {
    expect(sentConfig({ every })).toEqual({ schedule });
  });

  test.each([30_000, 90_000])('skips every %j ms', every => {
    expectSkipped({ every });
  });

  test.each([{ limit: 3 }, { endDate: Date.now() + 60_000 }])('skips a scheduler that ends: %j', end => {
    expectSkipped({ every: 60_000, ...end });
  });

  test.each([
    ['a job that is not from a scheduler', { name: 'job', opts: {} }],
    [
      'a legacy repeatable job',
      schedulerJob(createHash('md5').update('job::::60000').digest('hex'), { every: 60_000, offset: 1000 }),
    ],
    [
      'a legacy repeatable job with a jobId and tz',
      schedulerJob(createHash('md5').update('job:my-id::UTC:0 * * * *').digest('hex'), {
        pattern: '0 * * * *',
        tz: 'UTC',
        jobId: 'my-id',
      }),
    ],
    ['a legacy repeatable job with an unhashed key', schedulerJob('job::::60000', { every: 60_000 })],
    ['a legacy repeatable job with a custom key', schedulerJob('custom-key', { every: 60_000, key: 'custom-key' })],
    ['an excluded scheduler', schedulerJob('cache-warmup', { every: 60_000 })],
    ['a scheduler matching an excluded pattern', schedulerJob('tmp-cleanup', { every: 60_000 })],
  ])('ignores %s', (_, job) => {
    const worker = createWorker();
    instrumentWorker(worker, { excludeJobSchedulers: ['cache-warmup', /^tmp-/] }, 5);
    worker.processFn(job);
    worker.emit('failed', finalFailure(job));

    expect(captureCheckInSpy).not.toHaveBeenCalled();
  });

  test.each(['0123456789abcdef0123456789abcdef', 'a:b:c:d:e'])('monitors a scheduler with the id %j', id => {
    runJob(schedulerJob(id, { every: 60_000 }));

    expect(captureCheckInSpy).toHaveBeenCalledWith(
      expect.objectContaining({ monitorSlug: `reports-${id}`, status: 'ok' }),
      expect.anything(),
    );
  });

  test('calls the processor with the worker and its arguments', () => {
    const worker = createWorker();
    const processor = worker.processFn;
    instrumentWorker(worker, {}, 5);
    const job = schedulerJob('my-scheduler', { every: 60_000 });

    expect(worker.processFn.call(worker, job, 'token')).toBe('result');
    expect(processor).toHaveBeenCalledWith(job, 'token');
    expect(vi.mocked(processor).mock.contexts[0]).toBe(worker);
  });

  test('sends an error check-in for a job that fails without running the processor', () => {
    const worker = createWorker();
    instrumentWorker(worker, {}, 5);
    const job = finalFailure(schedulerJob('my-scheduler', { every: 60_000 }, { attemptsStarted: 3 }));
    worker.emit('failed', job, new Error('job started more than allowable limit'), 'active');

    expect(captureCheckInSpy).toHaveBeenCalledTimes(1);
    expect(captureCheckInSpy).toHaveBeenCalledWith(
      { monitorSlug: 'reports-my-scheduler', status: 'error', checkInId: expect.any(String) },
      { schedule: { type: 'interval', value: 1, unit: 'minute' } },
    );
  });

  test('keeps one check-in open across retries, on any worker', () => {
    const repeat = { every: 60_000 };
    const firstWorker = createWorker();
    instrumentWorker(firstWorker, {}, 5);
    const firstAttempt = schedulerJob('my-scheduler', repeat);
    firstWorker.processFn(firstAttempt);
    firstWorker.emit('failed', Object.assign(firstAttempt, { attemptsMade: 1 }), new Error('boom'), 'active');

    const secondWorker = createWorker();
    instrumentWorker(secondWorker, {}, 5);
    const retry = schedulerJob('my-scheduler', repeat, { attemptsStarted: 2, attemptsMade: 1 });
    secondWorker.processFn(retry);
    secondWorker.emit('completed', retry, 'result', 'active');

    const checkIns = captureCheckInSpy.mock.calls.map(([checkIn]) => checkIn);
    const checkInId = checkIns[0].checkInId;
    // Without a duration, Sentry measures from the first attempt's `in_progress` check-in.
    expect(checkIns).toEqual([
      { monitorSlug: 'reports-my-scheduler', status: 'in_progress', checkInId },
      { monitorSlug: 'reports-my-scheduler', status: 'in_progress', checkInId },
      { monitorSlug: 'reports-my-scheduler', status: 'ok', checkInId },
    ]);
  });

  test('uses a different check-in id for each run', () => {
    runJob(schedulerJob('my-scheduler', { every: 60_000 }));
    runJob(schedulerJob('my-scheduler', { every: 60_000 }, { id: 'repeat:my-scheduler:1767225660000' }));

    const [first, , second] = captureCheckInSpy.mock.calls.map(([checkIn]) => checkIn.checkInId);
    expect(first).not.toBe(second);
  });

  test('sends an ok check-in for a job that completes without running the processor', () => {
    const worker = createWorker();
    instrumentWorker(worker, {}, 5);
    worker.emit('completed', schedulerJob('my-scheduler', { every: 60_000 }), 'result', 'active');

    expect(captureCheckInSpy).toHaveBeenCalledWith(
      { monitorSlug: 'reports-my-scheduler', status: 'ok', checkInId: expect.any(String) },
      { schedule: { type: 'interval', value: 1, unit: 'minute' } },
    );
  });

  test('skips patterns with a custom repeat strategy', () => {
    const worker = createWorker({ settings: { repeatStrategy: () => Date.now() } });
    instrumentWorker(worker, {}, 5);
    for (const repeat of [{ pattern: '0 * * * *', tz: 'UTC' }, { every: 60_000 }]) {
      const job = schedulerJob('my-scheduler', repeat);
      worker.processFn(job);
      worker.emit('completed', job, 'result', 'active');
    }

    expect(captureCheckInSpy.mock.calls.map(([, config]) => config)).toEqual([
      { schedule: { type: 'interval', value: 1, unit: 'minute' } },
      { schedule: { type: 'interval', value: 1, unit: 'minute' } },
    ]);
  });

  test('instruments a worker only once', () => {
    const worker = createWorker();
    instrumentWorker(worker, {}, 5);
    runJob(schedulerJob('my-scheduler', { every: 60_000 }), 'completed', worker);

    expect(captureCheckInSpy).toHaveBeenCalledTimes(2);
  });

  test('does not throw into the worker when sending a check-in fails', () => {
    captureCheckInSpy.mockImplementation(() => {
      throw new Error('sentry failed');
    });

    expect(() => runJob(schedulerJob('my-scheduler', { every: 60_000 }))).not.toThrow();
  });
});
