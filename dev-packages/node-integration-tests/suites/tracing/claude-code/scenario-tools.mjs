/* eslint-disable no-console */
import { patchClaudeCodeQuery } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { createMockSdk } from './mock-server.mjs';

// This scenario specifically tests tool execution:
// - Function tools (Read, Bash, Glob, etc.)
// - Extension tools (WebSearch, WebFetch)
// - Tool input/output recording
// - Tool type classification

async function run() {
  const mockSdk = createMockSdk();

  // Manually patch the query function
  const originalQuery = mockSdk.query.bind(mockSdk);
  const patchedQuery = patchClaudeCodeQuery(originalQuery, {
    agentName: 'claude-code',
  });

  // Test function tools
  console.log('[Test] Running with function tools (Read)...');
  const query1 = patchedQuery({
    prompt: 'Read the file',
    options: { model: 'claude-sonnet-4-20250514', scenario: 'withTools' },
  });

  for await (const message of query1) {
    if (message.type === 'llm_tool_call') {
      console.log('[Tool Call]', message.toolName, '- Type: function');
    } else if (message.type === 'tool_result') {
      console.log('[Tool Result]', message.toolName, '- Status:', message.status);
    }
  }

  console.log('[Test] Function tools complete\n');

  // Test multiple tools in sequence
  console.log('[Test] Running with multiple tools...');
  const query2 = patchedQuery({
    prompt: 'Find and read JavaScript files',
    options: { model: 'claude-sonnet-4-20250514', scenario: 'multipleTools' },
  });

  const toolCalls = [];
  for await (const message of query2) {
    if (message.type === 'llm_tool_call') {
      toolCalls.push(message.toolName);
      console.log('[Tool Call]', message.toolName);
    }
  }

  console.log('[Test] Used tools:', toolCalls.join(', '));
  console.log('[Test] Multiple tools complete\n');

  // Test extension tools
  console.log('[Test] Running with extension tools...');
  const query3 = patchedQuery({
    prompt: 'Search the web',
    options: { model: 'claude-sonnet-4-20250514', scenario: 'extensionTools' },
  });

  for await (const message of query3) {
    if (message.type === 'llm_tool_call') {
      console.log('[Tool Call]', message.toolName, '- Type: extension');
    }
  }

  console.log('[Test] Extension tools complete\n');

  // Allow spans to be sent
  await Sentry.flush(2000);
  console.log('[Test] All tool scenarios complete');
}

run().catch(error => {
  console.error('[Fatal error]', error);
  process.exit(1);
});
