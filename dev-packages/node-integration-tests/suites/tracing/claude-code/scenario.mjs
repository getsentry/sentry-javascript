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

  // Query with tool usage
  const query2 = patchedQuery({
    prompt: 'Read the test file',
    options: { model: 'claude-sonnet-4-20250514', scenario: 'withTools' },
  });

  for await (const message of query2) {
    // Consume all messages
    if (message.type === 'error') {
      throw message.error;
    }
  }

  // Query with extension tools (WebSearch, WebFetch)
  const query3 = patchedQuery({
    prompt: 'Search for information about Sentry',
    options: { model: 'claude-sonnet-4-20250514', scenario: 'extensionTools' },
  });

  for await (const message of query3) {
    // Consume all messages
    if (message.type === 'error') {
      throw message.error;
    }
  }

  // Test error handling
  try {
    const query4 = patchedQuery({
      prompt: 'This will fail',
      options: { model: 'claude-sonnet-4-20250514', scenario: 'llmError' },
    });

    for await (const message of query4) {
      if (message.type === 'error') {
        throw message.error;
      }
    }
  } catch {
    // Expected error - swallow it
  }

  // Allow spans to be sent
  await Sentry.flush(2000);
}

run().catch(() => {
  process.exit(1);
});
