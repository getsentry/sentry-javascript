import * as Sentry from '@sentry/browser';
import { MockAnthropic } from './mocks.js';

// eslint-disable-next-line no-console
console.log('[Anthropic Test] Starting test...');

// eslint-disable-next-line no-console
console.log('[Anthropic Test] Creating mock client...');
const mockClient = new MockAnthropic({
  apiKey: 'mock-api-key',
});

// eslint-disable-next-line no-console
console.log('[Anthropic Test] Mock client created:', mockClient);

// eslint-disable-next-line no-console
console.log('[Anthropic Test] Instrumenting client with Sentry...');
const client = Sentry.instrumentAnthropicAiClient(mockClient);

// eslint-disable-next-line no-console
console.log('[Anthropic Test] Client instrumented:', client);

// Test that manual instrumentation doesn't crash the browser
// The instrumentation automatically creates spans
// eslint-disable-next-line no-console
console.log('[Anthropic Test] Calling messages.create...');
const response = await client.messages.create({
  model: 'claude-3-haiku-20240307',
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
  temperature: 0.7,
  max_tokens: 100,
});

// eslint-disable-next-line no-console
console.log('[Anthropic Test] Response received:', JSON.stringify(response));

// eslint-disable-next-line no-console
console.log('[Anthropic Test] Flushing Sentry...');
// Ensure transaction is flushed in CI
await Sentry.flush(2000);

// eslint-disable-next-line no-console
console.log('[Anthropic Test] Test completed!');
