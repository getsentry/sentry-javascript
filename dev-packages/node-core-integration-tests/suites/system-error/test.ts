import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('SystemError integration', () => {
  test('sendDefaultPii: false', async () => {
    await createRunner(__dirname, 'basic.mjs')
      .expect({
        event: {
          contexts: {
            node_system_error: {
              errno: -2,
              code: 'ENOENT',
              syscall: 'open',
            },
          },
          exception: {
            values: [
              {
                type: 'Error',
                value: 'ENOENT: no such file or directory, open',
              },
            ],
          },
        },
      })
      .start()
      .completed();
  });

  test('sendDefaultPii: true', async () => {
    await createRunner(__dirname, 'basic-pii.mjs')
      .expect({
        event: {
          contexts: {
            node_system_error: {
              errno: -2,
              code: 'ENOENT',
              syscall: 'open',
              path: 'non-existent-file.txt',
            },
          },
          exception: {
            values: [
              {
                type: 'Error',
                value: 'ENOENT: no such file or directory, open',
              },
            ],
          },
        },
      })
      .start()
      .completed();
  });
});
