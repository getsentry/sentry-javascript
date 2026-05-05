import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('nodeContextIntegration sets context attributes on segment spans', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const segmentSpan = container.items.find(s => !!s.is_segment);
        expect(segmentSpan).toBeDefined();

        const attrs = segmentSpan!.attributes!;

        expect(attrs['app.start_time']).toEqual({ type: 'string', value: expect.any(String) });
        expect(attrs['device.processor_count']).toEqual({ type: 'integer', value: expect.any(Number) });
        expect(attrs['process.runtime.engine.name']).toEqual({ type: 'string', value: 'v8' });
        expect(attrs['process.runtime.engine.version']).toEqual({ type: 'string', value: expect.any(String) });
      },
    })
    .start()
    .completed();
});
