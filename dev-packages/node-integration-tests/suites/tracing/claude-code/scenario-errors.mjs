/* eslint-disable no-console */
import { patchClaudeCodeQuery } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { createMockSdk } from './mock-server.mjs';

// This scenario tests error handling with a single error case
// to verify the span status is set correctly on failure.

async function run() {
  const mockSdk = createMockSdk();

  // Manually patch the query function
  const originalQuery = mockSdk.query.bind(mockSdk);
  const patchedQuery = patchClaudeCodeQuery(originalQuery, {
    agentName: 'claude-code',
  });

  // Test agent initialization error
  console.log('[Test] Running agent initialization error...');
  try {
    const query = patchedQuery({
      prompt: 'This will fail at agent init',
      options: { model: 'claude-sonnet-4-20250514', scenario: 'agentError' },
    });

    for await (const message of query) {
      console.log('[Message]', message.type);
    }
  } catch (error) {
    console.log('[Error caught]', error.message);
  }

  // Allow spans to be sent
  await Sentry.flush(2000);
  console.log('[Test] Error scenario complete');
}

run().catch(error => {
  console.error('[Fatal error]', error);
  process.exit(1);
});
