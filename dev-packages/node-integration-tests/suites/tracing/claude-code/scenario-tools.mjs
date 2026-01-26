/* eslint-disable no-console */
import { patchClaudeCodeQuery } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { createMockSdk } from './mock-server.mjs';

// This scenario tests function tool execution (Read, Bash, Glob, etc.)

async function run() {
  const mockSdk = createMockSdk();

  // Manually patch the query function
  const originalQuery = mockSdk.query.bind(mockSdk);
  const patchedQuery = patchClaudeCodeQuery(originalQuery, {
    agentName: 'claude-code',
  });

  // Test function tools
  console.log('[Test] Running with function tools (Read)...');
  const query = patchedQuery({
    prompt: 'Read the file',
    options: { model: 'claude-sonnet-4-20250514', scenario: 'withTools' },
  });

  for await (const message of query) {
    if (message.type === 'llm_tool_call') {
      console.log('[Tool Call]', message.toolName, '- Type: function');
    } else if (message.type === 'tool_result') {
      console.log('[Tool Result]', message.toolName, '- Status:', message.status);
    }
  }

  console.log('[Test] Function tools complete');

  // Allow spans to be sent
  await Sentry.flush(2000);
}

run().catch(error => {
  console.error('[Fatal error]', error);
  process.exit(1);
});
