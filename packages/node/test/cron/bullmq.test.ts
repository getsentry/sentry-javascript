import { EventEmitter } from 'node:events';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from 'vitest';
import { cron } from '../../src';

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

describe('cron.instrumentBullMQWorker', () => {
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

  function runJob(job: object, outcome: 'completed' | 'failed' = 'completed', worker = createWorker()): void {
    cron.instrumentBullMQWorker(worker);
    worker.processFn(job);
    if (outcome === 'failed') {
      worker.emit('failed', finalFailure(job), new Error('boom'), 'active');
    } else {
      worker.emit('completed', job, 'result', 'active');
    }
  }

  function sentConfig(repeat: Record<string, unknown>): unknown {
    runJob(schedulerJob('my-scheduler', repeat));
    return captureCheckInSpy.mock.calls[0]?.[1];
  }

  function expectSkipped(repeat: Record<string, unknown>): void {
    runJob(schedulerJob('my-scheduler', repeat), 'failed');
    const worker = createWorker();
    cron.instrumentBullMQWorker(worker);
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

  test('uses UTC with utc: true', () => {
    expect(sentConfig({ pattern: '0 * * * *', tz: 'Europe/Vienna', utc: true })).toEqual({
      schedule: { type: 'crontab', value: '0 * * * *' },
      timezone: 'UTC',
    });
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
    ['a legacy repeatable job', schedulerJob('ef2e05b7df2d56840b735ad4ee3a6937', { every: 60_000 })],
    ['an excluded scheduler', schedulerJob('cache-warmup', { every: 60_000 })],
    ['a scheduler matching an excluded pattern', schedulerJob('tmp-cleanup', { every: 60_000 })],
  ])('ignores %s', (_, job) => {
    const worker = createWorker();
    cron.instrumentBullMQWorker(worker, { excludeJobSchedulers: ['cache-warmup', /^tmp-/] });
    worker.processFn(job);
    worker.emit('failed', finalFailure(job));

    expect(captureCheckInSpy).not.toHaveBeenCalled();
  });

  test('calls the processor with the worker and its arguments', () => {
    const worker = createWorker();
    const processor = worker.processFn;
    cron.instrumentBullMQWorker(worker);
    const job = schedulerJob('my-scheduler', { every: 60_000 });

    expect(worker.processFn.call(worker, job, 'token')).toBe('result');
    expect(processor).toHaveBeenCalledWith(job, 'token');
    expect(vi.mocked(processor).mock.contexts[0]).toBe(worker);
  });

  test('sends an error check-in for a job that fails without running the processor', () => {
    const worker = createWorker();
    cron.instrumentBullMQWorker(worker);
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
    cron.instrumentBullMQWorker(firstWorker);
    const firstAttempt = schedulerJob('my-scheduler', repeat);
    firstWorker.processFn(firstAttempt);
    firstWorker.emit('failed', Object.assign(firstAttempt, { attemptsMade: 1 }), new Error('boom'), 'active');

    const secondWorker = createWorker();
    cron.instrumentBullMQWorker(secondWorker);
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
    cron.instrumentBullMQWorker(worker);
    worker.emit('completed', schedulerJob('my-scheduler', { every: 60_000 }), 'result', 'active');

    expect(captureCheckInSpy).toHaveBeenCalledWith(
      { monitorSlug: 'reports-my-scheduler', status: 'ok', checkInId: expect.any(String) },
      { schedule: { type: 'interval', value: 1, unit: 'minute' } },
    );
  });

  test('skips patterns with a custom repeat strategy', () => {
    const worker = createWorker({ settings: { repeatStrategy: () => Date.now() } });
    cron.instrumentBullMQWorker(worker);
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
    cron.instrumentBullMQWorker(worker);
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
