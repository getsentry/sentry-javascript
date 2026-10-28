import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('scope contexts are converted to segment span attributes in span streaming', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const segmentSpan = container.items.find(s => !!s.is_segment);
        expect(segmentSpan).toBeDefined();

        const attrs = segmentSpan!.attributes!;

        // response context -> http.response.* attributes
        expect(attrs['http.response.status_code']).toEqual({ type: 'integer', value: 200 });

        // cloud_resource context (dot-notation passthrough)
        expect(attrs['cloud.provider']).toEqual({ type: 'string', value: 'aws' });
        expect(attrs['cloud.region']).toEqual({ type: 'string', value: 'us-east-1' });

        // profile context
        expect(attrs['sentry.profile_id']).toEqual({ type: 'string', value: 'abc123' });

        // framework version context
        expect(attrs['react.version']).toEqual({ type: 'string', value: '18.2.0' });
      },
    })
    .start()
    .completed();
});
