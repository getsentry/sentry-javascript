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

    // Find the two 'ok' check-ins for comparison
    const checkIn1Ok = checkIns.find(c => c.monitor_slug === 'cron-job-1' && c.status === 'ok');
    const checkIn2Ok = checkIns.find(c => c.monitor_slug === 'cron-job-2' && c.status === 'ok');

    expect(checkIn1Ok).toBeDefined();
    expect(checkIn2Ok).toBeDefined();

    // Verify both check-ins have trace contexts
    expect(checkIn1Ok!.contexts?.trace?.trace_id).toBeDefined();
    expect(checkIn2Ok!.contexts?.trace?.trace_id).toBeDefined();

    // The key assertion: trace IDs should be different when isolateTrace is enabled
    expect(checkIn1Ok!.contexts!.trace!.trace_id).not.toBe(checkIn2Ok!.contexts!.trace!.trace_id);
  });
});