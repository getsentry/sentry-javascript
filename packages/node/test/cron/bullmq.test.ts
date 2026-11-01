import { EventEmitter } from 'node:events';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from 'vitest';
import { cron } from '../../src';

function schedulerJob(id: string, repeat: Record<string, unknown>): object {
  return { name: 'job', repeatJobKey: id, opts: { repeat: { count: 1, ...repeat } } };
}

describe('cron.instrumentBullMQWorker', () => {
  let captureCheckInSpy: MockInstance;

  beforeEach(() => {
    captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn').mockReturnValue('check-in-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createWorker(): EventEmitter & { processFn: (job: object) => unknown } {
    return Object.assign(new EventEmitter(), { processFn: vi.fn((_job: object) => 'result') });
  }

  function runJob(job: object, outcome: 'completed' | 'failed' = 'completed', worker = createWorker()): void {
    cron.instrumentBullMQWorker(worker);
    worker.processFn(job);
    worker.emit(outcome, job, outcome === 'failed' ? new Error('boom') : 'result', 'active');
  }

  function sentConfig(repeat: Record<string, unknown>): unknown {
    runJob(schedulerJob('my-scheduler', repeat));
    return captureCheckInSpy.mock.calls[0]?.[1];
  }

  function expectSkipped(repeat: Record<string, unknown>): void {
    runJob(schedulerJob('my-scheduler', repeat), 'failed');
    const worker = createWorker();
    cron.instrumentBullMQWorker(worker);
    worker.emit('failed', schedulerJob('my-scheduler', repeat), new Error('stalled'), 'active');
    expect(captureCheckInSpy).not.toHaveBeenCalled();
  }

  test('sends in_progress and ok check-ins with the scheduler id as slug', () => {
    runJob(schedulerJob('daily-report', { pattern: '0 9 * * 1-5', tz: 'Europe/Vienna' }));

    expect(captureCheckInSpy).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: 'daily-report', status: 'in_progress' },
      { schedule: { type: 'crontab', value: '0 9 * * 1-5' }, timezone: 'Europe/Vienna' },
    );
    expect(captureCheckInSpy).toHaveBeenNthCalledWith(2, {
      monitorSlug: 'daily-report',
      status: 'ok',
      checkInId: 'check-in-id',
      duration: expect.any(Number),
    });
  });

  test('sends an error check-in when the job fails', () => {
    runJob(schedulerJob('daily-report', { every: 60_000 }), 'failed');

    expect(captureCheckInSpy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
  });

  test.each([
    ['0 0 9 * * *', '0 9 * * *'],
    ['*/15 9-17 * * mon-fri', '*/15 9-17 * * 1-5'],
    ['0 0 1 JAN *', '0 0 1 1 *'],
    ['0 0 L * *', '0 0 L * *'],
    ['0 0 * * 5L', '0 0 * * 5L'],
    ['0 0 * * 1#2', '0 0 * * 1#2'],
    ['0 0 1 * 1', '0 0 1 * 1'],
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
    '0 0 1 * 0-6',
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
    worker.emit('failed', job);

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
    worker.emit('failed', schedulerJob('my-scheduler', { every: 60_000 }), new Error('stalled'), 'active');

    expect(captureCheckInSpy).toHaveBeenCalledTimes(1);
    expect(captureCheckInSpy).toHaveBeenCalledWith(
      { monitorSlug: 'my-scheduler', status: 'error' },
      { schedule: { type: 'interval', value: 1, unit: 'minute' } },
    );
  });

  test('sends no check-in for a job that completes without running the processor', () => {
    const worker = createWorker();
    cron.instrumentBullMQWorker(worker);
    worker.emit('completed', schedulerJob('my-scheduler', { every: 60_000 }), 'result', 'active');

    expect(captureCheckInSpy).not.toHaveBeenCalled();
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
