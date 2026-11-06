import type { Event, SerializedCheckIn } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('bullmq job scheduler check-ins', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('sends check-ins with the job scheduler schedule', { timeout: 60_000 }, async () => {
    await createRunner(__dirname, 'scenario.ts')
      .unordered()
      .expect({
        check_in: {
          check_in_id: expect.any(String),
          monitor_slug: 'every-scheduler',
          status: 'in_progress',
          release: '1.0',
          monitor_config: { schedule: { type: 'interval', value: 5, unit: 'minute' } },
        },
      })
      .expect({
        check_in: {
          check_in_id: expect.any(String),
          monitor_slug: 'every-scheduler',
          status: 'ok',
          release: '1.0',
          duration: expect.any(Number),
        },
      })
      .expect({
        check_in: {
          check_in_id: expect.any(String),
          monitor_slug: 'pattern-scheduler',
          status: 'in_progress',
          release: '1.0',
          monitor_config: { schedule: { type: 'crontab', value: '0 9 * * 1-5' }, timezone: 'Europe/Vienna' },
        },
      })
      .expect({
        check_in: {
          check_in_id: expect.any(String),
          monitor_slug: 'pattern-scheduler',
          status: 'error',
          release: '1.0',
          duration: expect.any(Number),
        },
      })
      .start()
      .completed();
  });

  test.each([
    ['after the worker starts', 'false'],
    ['before the worker runs', 'true'],
  ])(
    'sends one check-in pair per run in the job trace with BullMQTelemetry, instrumented %s',
    { timeout: 60_000 },
    async (_, instrumentBeforeRun) => {
      const checkIns: SerializedCheckIn[] = [];
      const errors: Event[] = [];
      const runner = createRunner(__dirname, 'scenario-telemetry.mjs')
        .withEnv({ INSTRUMENT_BEFORE_RUN: instrumentBeforeRun })
        .unordered()
        .expectN(4, { check_in: checkIn => void checkIns.push(checkIn) })
        .expect({ event: event => void errors.push(event) });
      const spansByJob = ['ok-job', 'failing-job'].map(jobName =>
        runner.collectStreamedSpans(spans =>
          spans.some(
            span =>
              span.is_segment &&
              span.name === 'process crons-telemetry' &&
              span.attributes['messaging.bullmq.job.name']?.value === jobName,
          ),
        ),
      );

      await runner.start().completed();

      const [okSpans, failingSpans] = await Promise.all(spansByJob);
      const okSegment = okSpans!.find(span => span.is_segment)!;
      const failingSegment = failingSpans!.find(span => span.is_segment)!;

      expect(okSegment.status).toBe('ok');
      expect(failingSegment.status).toBe('error');
      expect(okSpans!.some(span => span.name === 'work ok-job' && span.parent_span_id === okSegment.span_id)).toBe(
        true,
      );
      expect(
        failingSpans!.some(span => span.name === 'work failing-job' && span.parent_span_id === failingSegment.span_id),
      ).toBe(true);

      const summary = (slug: string): unknown =>
        checkIns
          .filter(checkIn => checkIn.monitor_slug === slug)
          .map(checkIn => ({
            status: checkIn.status,
            check_in_id: checkIn.check_in_id,
            trace_id: checkIn.contexts?.trace?.trace_id,
          }));
      const okCheckInId = checkIns.find(checkIn => checkIn.monitor_slug === 'ok-scheduler')?.check_in_id;
      const failingCheckInId = checkIns.find(checkIn => checkIn.monitor_slug === 'failing-scheduler')?.check_in_id;

      expect(summary('ok-scheduler')).toEqual([
        { status: 'in_progress', check_in_id: okCheckInId, trace_id: okSegment.trace_id },
        { status: 'ok', check_in_id: okCheckInId, trace_id: okSegment.trace_id },
      ]);
      expect(summary('failing-scheduler')).toEqual([
        { status: 'in_progress', check_in_id: failingCheckInId, trace_id: failingSegment.trace_id },
        { status: 'error', check_in_id: failingCheckInId, trace_id: failingSegment.trace_id },
      ]);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.exception?.values?.[0]?.value).toBe('Error in scheduled job');
      expect(errors[0]?.contexts?.trace?.trace_id).toBe(failingSegment.trace_id);
    },
  );
});
