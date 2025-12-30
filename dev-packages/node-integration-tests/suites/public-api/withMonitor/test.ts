import type { SerializedCheckIn } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('withMonitor isolateTrace', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('creates distinct traces when isolateTrace is enabled', async () => {
    const checkIns: SerializedCheckIn[] = [];

    await createRunner(__dirname, 'scenario.ts')
      .expect({
        check_in: checkIn => {
          checkIns.push(checkIn);
        },
      })
      .expect({
        check_in: checkIn => {
          checkIns.push(checkIn);
        },
      })
      .expect({
        check_in: checkIn => {
          checkIns.push(checkIn);
        },
      })
      .expect({
        check_in: checkIn => {
          checkIns.push(checkIn);
        },
      })
      .start()
      .completed();

    const checkIn1InProgress = checkIns.find(c => c.monitor_slug === 'cron-job-1' && c.status === 'in_progress');
    const checkIn1Ok = checkIns.find(c => c.monitor_slug === 'cron-job-1' && c.status === 'ok');

    const checkIn2InProgress = checkIns.find(c => c.monitor_slug === 'cron-job-2' && c.status === 'in_progress');
    const checkIn2Ok = checkIns.find(c => c.monitor_slug === 'cron-job-2' && c.status === 'ok');

    expect(checkIn1InProgress?.contexts?.trace?.trace_id).toMatch(/[a-f\d]{32}/);
    expect(checkIn1Ok?.contexts?.trace?.trace_id).toMatch(/[a-f\d]{32}/);
    expect(checkIn2InProgress?.contexts?.trace?.trace_id).toMatch(/[a-f\d]{32}/);
    expect(checkIn2Ok?.contexts?.trace?.trace_id).toMatch(/[a-f\d]{32}/);

    expect(checkIn1InProgress!.contexts?.trace?.trace_id).not.toBe(checkIn2InProgress!.contexts?.trace?.trace_id);
    expect(checkIn1Ok!.contexts?.trace?.span_id).not.toBe(checkIn2Ok!.contexts?.trace?.span_id);

    expect(checkIn1Ok!.contexts?.trace?.trace_id).toBe(checkIn1InProgress!.contexts?.trace?.trace_id);
    expect(checkIn2Ok!.contexts?.trace?.trace_id).toBe(checkIn2InProgress!.contexts?.trace?.trace_id);
  });
});
