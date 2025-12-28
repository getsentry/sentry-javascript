/* eslint-disable no-console */
import { patchClaudeCodeQuery } from '@sentry/node';
import * as Sentry from '@sentry/node';

// Very simple scenario to debug test infrastructure
// Uses correct Claude Agent SDK message format

class SimpleMockSdk {
  async *query(params) {
    console.log('[Mock] Query called with model:', params.options?.model);

    const usage = {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    // System message with session ID
    yield {
      type: 'system',
      session_id: 'sess_test123',
      model: 'claude-sonnet-4-20250514',
      conversation_history: params.inputMessages || [],
    };

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 10));

    // Assistant message (LLM response)
    yield {
      type: 'assistant',
      message: {
        id: 'resp_test456',
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        content: [{ type: 'text', text: 'Test response' }],
        stop_reason: 'end_turn',
        usage,
      },
    };

    // Result message (includes usage for final stats)
    yield { type: 'result', result: 'Test response', usage };

    console.log('[Mock] Query generator complete');
  }
}

async function run() {
  console.log('[Test] Starting simple scenario...');

  const mockSdk = new SimpleMockSdk();
  const originalQuery = mockSdk.query.bind(mockSdk);

  console.log('[Test] Patching query function...');
  const patchedQuery = patchClaudeCodeQuery(originalQuery, {
    agentName: 'claude-code',
  });

  console.log('[Test] Running patched query...');
  const query = patchedQuery({
    prompt: 'Test',
    inputMessages: [{ role: 'user', content: 'Test' }],
    options: { model: 'claude-sonnet-4-20250514' },
  });

  let messageCount = 0;
  for await (const message of query) {
    messageCount++;
    console.log(`[Test] Message ${messageCount}:`, message.type);
  }

  console.log(`[Test] Received ${messageCount} messages`);
  console.log('[Test] Flushing Sentry...');

  await Sentry.flush(2000);

  console.log('[Test] Complete');
}

run().catch(error => {
  console.error('[Fatal error]', error);
  console.error(error.stack);
  process.exit(1);
});
