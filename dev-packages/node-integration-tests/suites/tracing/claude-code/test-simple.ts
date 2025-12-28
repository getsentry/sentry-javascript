import { afterAll, describe } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Claude Code Agent SDK integration - Simple', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Very basic expectation - just check that a transaction is created
  createEsmAndCjsTests(__dirname, 'scenario-simple.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates a transaction with claude-code spans', async () => {
      await createRunner()
        .expect({
          transaction: {
            transaction: 'invoke_agent claude-code',
          },
        })
        .start()
        .completed();
    }, 20000); // Increase timeout
  });
});
