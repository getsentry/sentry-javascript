/* eslint-disable no-console */
import { patchClaudeCodeQuery } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { createMockSdk } from './mock-server.mjs';

// This scenario tests basic agent invocation with manual patching
// The integration uses OpenTelemetry auto-instrumentation, but for testing
// we need to manually patch the mock SDK

async function run() {
  const mockSdk = createMockSdk();

  // Manually patch the query function
  const originalQuery = mockSdk.query.bind(mockSdk);
  const patchedQuery = patchClaudeCodeQuery(originalQuery, {
    agentName: 'claude-code',
  });

  // Basic query
  console.log('[Test] Running basic agent invocation...');
  const query1 = patchedQuery({
    prompt: 'What is the capital of France?',
    inputMessages: [{ role: 'user', content: 'What is the capital of France?' }],
    options: { model: 'claude-sonnet-4-20250514', scenario: 'basic' },
  });

  for await (const message of query1) {
    console.log('[Message]', message.type);
    if (message.type === 'llm_text') {
      console.log('[LLM Text]', message.text);
    }
  }

  console.log('[Test] Basic invocation complete\n');

  // Query with tool usage
  console.log('[Test] Running agent invocation with tools...');
  const query2 = patchedQuery({
    prompt: 'Read the test file',
    inputMessages: [{ role: 'user', content: 'Read the test file' }],
    options: { model: 'claude-sonnet-4-20250514', scenario: 'withTools' },
  });

  for await (const message of query2) {
    console.log('[Message]', message.type);
    if (message.type === 'llm_text') {
      console.log('[LLM Text]', message.text);
    } else if (message.type === 'llm_tool_call') {
      console.log('[Tool Call]', message.toolName, message.toolInput);
    } else if (message.type === 'tool_result') {
      console.log('[Tool Result]', message.toolName, message.status);
    }
  }

  console.log('[Test] Tool invocation complete\n');

  // Query with extension tools (WebSearch, WebFetch)
  console.log('[Test] Running agent invocation with extension tools...');
  const query3 = patchedQuery({
    prompt: 'Search for information about Sentry',
    inputMessages: [{ role: 'user', content: 'Search for information about Sentry' }],
    options: { model: 'claude-sonnet-4-20250514', scenario: 'extensionTools' },
  });

  for await (const message of query3) {
    console.log('[Message]', message.type);
    if (message.type === 'llm_tool_call') {
      console.log('[Tool Call]', message.toolName, 'type:', getToolType(message.toolName));
    }
  }

  console.log('[Test] Extension tools invocation complete\n');

  // Test error handling
  console.log('[Test] Running agent invocation with LLM error...');
  try {
    const query4 = patchedQuery({
      prompt: 'This will fail',
      inputMessages: [{ role: 'user', content: 'This will fail' }],
      options: { model: 'claude-sonnet-4-20250514', scenario: 'llmError' },
    });

    for await (const message of query4) {
      console.log('[Message]', message.type);
      if (message.type === 'error') {
        throw message.error;
      }
    }
  } catch (error) {
    console.log('[Error caught]', error.message);
  }

  console.log('[Test] Error handling complete\n');

  // Allow spans to be sent
  await Sentry.flush(2000);
  console.log('[Test] All scenarios complete');
}

function getToolType(toolName) {
  const functionTools = new Set([
    'Bash',
    'BashOutput',
    'KillShell',
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Task',
    'ExitPlanMode',
    'TodoWrite',
    'NotebookEdit',
    'SlashCommand',
  ]);
  const extensionTools = new Set(['WebSearch', 'WebFetch']);

  if (functionTools.has(toolName)) return 'function';
  if (extensionTools.has(toolName)) return 'extension';
  return 'function';
}

run().catch(error => {
  console.error('[Fatal error]', error);
  process.exit(1);
});
