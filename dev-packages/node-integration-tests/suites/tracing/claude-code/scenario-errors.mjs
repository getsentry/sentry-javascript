/* eslint-disable no-console */
import { patchClaudeCodeQuery } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { createMockSdk } from './mock-server.mjs';

// This scenario tests error handling:
// - Agent initialization errors
// - LLM errors (rate limits, API errors)
// - Tool execution errors
// - Error span attributes and status

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
    const query1 = patchedQuery({
      prompt: 'This will fail at agent init',
      options: { model: 'claude-sonnet-4-20250514', scenario: 'agentError' },
    });

    for await (const message of query1) {
      console.log('[Message]', message.type);
      if (message.type === 'error') {
        throw message.error;
      }
    }
  } catch (error) {
    console.log('[Error caught]', error.message);
    console.log('[Test] Agent error handled\n');
  }

  // Test LLM error (rate limit)
  console.log('[Test] Running LLM error (rate limit)...');
  try {
    const query2 = patchedQuery({
      prompt: 'This will fail during LLM call',
      options: { model: 'claude-sonnet-4-20250514', scenario: 'llmError' },
    });

    for await (const message of query2) {
      console.log('[Message]', message.type);
      if (message.type === 'error') {
        console.log('[Error details]', {
          message: message.error.message,
          code: message.code,
          statusCode: message.statusCode,
        });
        throw message.error;
      }
    }
  } catch (error) {
    console.log('[Error caught]', error.message);
    console.log('[Test] LLM error handled\n');
  }

  // Test tool execution error
  console.log('[Test] Running tool execution error...');
  const query3 = patchedQuery({
    prompt: 'Run a command that will fail',
    options: { model: 'claude-sonnet-4-20250514', scenario: 'toolError' },
  });

  let toolErrorSeen = false;
  for await (const message of query3) {
    console.log('[Message]', message.type);
    if (message.type === 'tool_result' && message.status === 'error') {
      console.log('[Tool Error]', message.toolName, '-', message.error);
      toolErrorSeen = true;
    } else if (message.type === 'agent_complete') {
      console.log('[Agent Complete]', message.result);
    }
  }

  if (toolErrorSeen) {
    console.log('[Test] Tool error recorded successfully');
  }
  console.log('[Test] Tool error scenario complete\n');

  // Allow spans to be sent
  await Sentry.flush(2000);
  console.log('[Test] All error scenarios complete');
}

run().catch(error => {
  console.error('[Fatal error]', error);
  process.exit(1);
});
