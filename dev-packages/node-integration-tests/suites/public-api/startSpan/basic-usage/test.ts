import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('sends a manually started root span with source custom', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const segment = container.items.find(span => span.is_segment);
        expect(segment?.name).toBe('test_span');
        expect(segment?.span_id).toEqual(expect.any(String));
        expect(segment?.trace_id).toEqual(expect.any(String));
        expect(segment?.start_timestamp).toEqual(expect.any(Number));
        expect(segment?.end_timestamp).toEqual(expect.any(Number));
        expect(segment?.attributes[SENTRY_SEGMENT_NAME_SOURCE]).toEqual({ type: 'string', value: 'custom' });
      },
    })
    .start()
    .completed();
});
