import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should set primitive tags', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: event => {
        expect(event.message).toBe('primitive_tags-set-tags');
        expect(event.tags).toEqual({
          tag_1: 'foo',
          tag_2: 3.141592653589793,
          tag_3: false,
          tag_4: null,
          tag_6: -1,
        });
      },
    })
    .start()
    .completed();
});
