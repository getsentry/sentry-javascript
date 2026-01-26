/* eslint-disable no-console */
import { patchClaudeCodeQuery } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { createMockSdk } from './mock-server.mjs';

// This scenario specifically tests extension tool classification (WebSearch, WebFetch)

async function run() {
  const mockSdk = createMockSdk();

  // Manually patch the query function
  const originalQuery = mockSdk.query.bind(mockSdk);
  const patchedQuery = patchClaudeCodeQuery(originalQuery, {
    agentName: 'claude-code',
  });

  // Test extension tools
  console.log('[Test] Running with extension tools...');
  const query = patchedQuery({
    prompt: 'Search the web',
    options: { model: 'claude-sonnet-4-20250514', scenario: 'extensionTools' },
  });

  for await (const message of query) {
    if (message.type === 'llm_tool_call') {
      console.log('[Tool Call]', message.toolName, '- Type: extension');
    }
  }

  console.log('[Test] Extension tools complete');

  // Allow spans to be sent
  await Sentry.flush(2000);
}

run().catch(error => {
  console.error('[Fatal error]', error);
  process.exit(1);
});
