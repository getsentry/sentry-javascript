import { EventEmitter } from 'node:events';
import * as SentryCore from '@sentry/core';
import { setCurrentClient } from '@sentry/core';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monitorGraphileCronJobs } from '../../src/integrations/graphile-worker';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

type Digest = { min: number; hour: number; date: number; month: number; dow: number };

const ALL = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Mirrors a graphile-worker `ParsedCronItem` built from a crontab line.
function cronItem(
  identifier: string,
  task: string,
  ranges: { minutes?: number[]; hours?: number[]; dates?: number[]; months?: number[]; dows?: number[] },
  payload: Record<string, unknown> = {},
) {
  const parsedCronMatch = {
    minutes: ALL(0, 59),
    hours: ALL(0, 23),
    dates: ALL(1, 31),
    months: ALL(1, 12),
    dows: ALL(0, 6),
    ...ranges,
  };
  const match = Object.assign(
    (d: Digest) =>
      parsedCronMatch.minutes.includes(d.min) &&
      parsedCronMatch.hours.includes(d.hour) &&
      parsedCronMatch.months.includes(d.month),
    { parsedCronMatch },
  );
  return { identifier, task, payload, match };
}

function cronJob(task: string, ts: string, payload: Record<string, unknown> = {}) {
  return { task_identifier: task, payload: { ...payload, _cron: { ts, backfilled: false } } };
}

describe('graphile-worker crontab monitoring', () => {
  let captureCheckIn: MockInstance<typeof SentryCore.captureCheckIn>;
  let captureException: MockInstance<typeof SentryCore.captureException>;

  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();
    captureCheckIn = vi.spyOn(SentryCore, 'captureCheckIn').mockReturnValue('check-in-id');
    captureException = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function runJob(events: EventEmitter, job: object, error?: unknown): void {
    events.emit('job:start', { job });
    events.emit('job:complete', { job, error });
  }

  it('sends check-ins using the item identifier as slug', () => {
    const events = new EventEmitter();
    monitorGraphileCronJobs(events, [cronItem('hourly-report', 'report', { minutes: [0], dows: [1, 2, 3, 4, 5] })], {});

    runJob(events, cronJob('report', '2026-10-16T09:00:00.000Z'));

    expect(captureCheckIn.mock.calls).toEqual([
      [{ monitorSlug: 'hourly-report', status: 'in_progress' }],
      [{ monitorSlug: 'hourly-report', status: 'ok', checkInId: 'check-in-id', duration: expect.any(Number) }],
    ]);
  });

  it('sends an error check-in and captures the error', () => {
    const events = new EventEmitter();
    monitorGraphileCronJobs(events, [cronItem('report', 'report', { minutes: [0] })], {});
    const error = new Error('boom');

    runJob(events, cronJob('report', '2026-10-16T09:00:00.000Z'), error);

    expect(captureCheckIn.mock.calls[1]?.[0]).toMatchObject({ monitorSlug: 'report', status: 'error' });
    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.function.graphile_worker.cron' },
    });
  });

  it('tells items of the same task apart by schedule and payload', () => {
    const events = new EventEmitter();
    monitorGraphileCronJobs(
      events,
      [
        cronItem('morning', 'send', { minutes: [0], hours: [8] }),
        cronItem('evening-a', 'send', { minutes: [0], hours: [20] }, { list: 'a' }),
        cronItem('evening-b', 'send', { minutes: [0], hours: [20] }, { list: 'b' }),
      ],
      {},
    );

    runJob(events, cronJob('send', '2026-10-16T08:00:00.000Z'));
    runJob(events, cronJob('send', '2026-10-16T20:00:00.000Z', { list: 'b' }));

    expect(captureCheckIn.mock.calls.map(([checkIn]) => checkIn.monitorSlug)).toEqual([
      'morning',
      'morning',
      'evening-b',
      'evening-b',
    ]);
  });

  it('does not throw into the worker when sending a check-in fails', () => {
    const events = new EventEmitter();
    monitorGraphileCronJobs(events, [cronItem('report', 'report', { minutes: [0] })], {});
    captureCheckIn.mockImplementation(() => {
      throw new Error('sentry failed');
    });

    expect(() => runJob(events, cronJob('report', '2026-10-16T09:00:00.000Z'), new Error('boom'))).not.toThrow();
  });

  it('skips jobs that were not scheduled by the crontab, ambiguous jobs and excluded items', () => {
    const events = new EventEmitter();
    monitorGraphileCronJobs(
      events,
      [
        cronItem('a', 'same', { minutes: [0] }),
        cronItem('b', 'same', { minutes: [0] }),
        cronItem('excluded', 'excluded', { minutes: [0] }),
        cronItem('other-excluded', 'other', { minutes: [0] }),
      ],
      { excludeCronJobs: ['excluded', /^other-/] },
    );

    runJob(events, { task_identifier: 'same', payload: {} });
    runJob(events, cronJob('same', '2026-10-16T09:00:00.000Z'));
    runJob(events, cronJob('excluded', '2026-10-16T09:00:00.000Z'));
    runJob(events, cronJob('other', '2026-10-16T09:00:00.000Z'));

    expect(captureCheckIn).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});
