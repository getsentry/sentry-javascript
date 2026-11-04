import { expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

test('sends buffered spans when the process exits on its own', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .withoutAutoFlush()
    .expect({
      span: container => {
        expect(container.items.map(span => span.name).sort()).toEqual(['cron-job', 'step']);
      },
    })
    .start()
    .completed();
});
