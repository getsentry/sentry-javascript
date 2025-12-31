import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture a simple error with message', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: event => {
        expect(event.exception?.values?.[0]?.value).toBe('[2001:db8::1]');
      },
    })
    .start()
    .completed();
});
