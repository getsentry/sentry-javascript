import { instrumentAnthropicAiClient } from '@sentry/browser';
import { MockAnthropic } from './mocks.js';

const mockClient = new MockAnthropic({
  apiKey: 'mock-api-key',
});

const client = instrumentAnthropicAiClient(mockClient);

// Test that manual instrumentation doesn't crash the browser
// The instrumentation automatically creates spans
const response = await client.messages.create({
  model: 'claude-3-haiku-20240307',
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
  temperature: 0.7,
  max_tokens: 100,
});

console.log('Received response', response);
