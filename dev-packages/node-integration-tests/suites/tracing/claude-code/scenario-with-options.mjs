import { patchClaudeCodeQuery } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { createMockSdk } from './mock-server.mjs';

// This scenario tests custom recordInputs/recordOutputs options
// It uses manual patching with explicit options that match instrument-with-options.mjs:
// - recordInputs: true (input messages SHOULD be recorded)
// - recordOutputs: false (output text should NOT be recorded)

async function run() {
  const mockSdk = createMockSdk();

  // Manually patch the query function with options that match the integration config
  const originalQuery = mockSdk.query.bind(mockSdk);
  const patchedQuery = patchClaudeCodeQuery(originalQuery, {
    agentName: 'claude-code',
    recordInputs: true,
    recordOutputs: false,
  });

  // Basic query
  const query1 = patchedQuery({
    prompt: 'What is the capital of France?',
    options: { model: 'claude-sonnet-4-20250514', scenario: 'basic' },
  });

  for await (const message of query1) {
    // Consume all messages
    if (message.type === 'error') {
      throw message.error;
    }
  }

  // Allow spans to be sent
  await Sentry.flush(2000);
}

run().catch(() => {
  process.exit(1);
});
