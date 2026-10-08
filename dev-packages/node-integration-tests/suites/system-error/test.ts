import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';
import { supports } from '../../utils';

afterAll(() => {
  cleanupChildProcesses();
});

// Fails on Bun before 1.4, cause not investigated yet.
describe.runIf(supports({ bunMin: '1.4.0' }))('SystemError integration', () => {
  test('userInfo: false', async () => {
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

  test('userInfo: true', async () => {
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
