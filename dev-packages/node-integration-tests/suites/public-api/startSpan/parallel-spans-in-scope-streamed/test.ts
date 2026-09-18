import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('sends manually started streamed parallel root spans outside of root context', async () => {
  expect.assertions(6);

  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: spanContainer => {
        expect(spanContainer).toBeDefined();

        const span1 = spanContainer.items.find(item => item.name === 'test_span_1');
        const span2 = spanContainer.items.find(item => item.name === 'test_span_2');
        expect(span1).toBeDefined();
        expect(span2).toBeDefined();

        expect(span1!.trace_id).toMatch(/^[0-9a-f]{32}$/);
        expect(span1!.parent_span_id).toBeUndefined();

        // Same trace ID for both spans - both root spans share the scope's propagation context
        expect(span2!.trace_id).toBe(span1!.trace_id);
      },
    })
    .start()
    .completed();
});
