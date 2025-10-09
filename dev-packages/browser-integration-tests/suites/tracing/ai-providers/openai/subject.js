import * as Sentry from '@sentry/browser';
import { MockOpenAi } from './mocks.js';

// eslint-disable-next-line no-console
console.log('[OpenAI Test] Starting test...');

// eslint-disable-next-line no-console
console.log('[OpenAI Test] Creating mock client...');
const mockClient = new MockOpenAi({
  apiKey: 'mock-api-key',
});

// eslint-disable-next-line no-console
console.log('[OpenAI Test] Mock client created:', mockClient);

// eslint-disable-next-line no-console
console.log('[OpenAI Test] Instrumenting client with Sentry...');
const client = Sentry.instrumentOpenAiClient(mockClient);

// eslint-disable-next-line no-console
console.log('[OpenAI Test] Client instrumented:', client);

// Test that manual instrumentation doesn't crash the browser
// The instrumentation automatically creates spans
// eslint-disable-next-line no-console
console.log('[OpenAI Test] Calling chat.completions.create...');
const response = await client.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' },
  ],
  temperature: 0.7,
  max_tokens: 100,
});

// eslint-disable-next-line no-console
console.log('[OpenAI Test] Response received:', JSON.stringify(response));

// eslint-disable-next-line no-console
console.log('[OpenAI Test] Flushing Sentry...');
// Ensure transaction is flushed in CI
await Sentry.flush(2000);

// eslint-disable-next-line no-console
console.log('[OpenAI Test] Test completed!');
