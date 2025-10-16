import { instrumentOpenAiClient } from '@sentry/browser';
import { MockOpenAi } from './mocks.js';

const mockClient = new MockOpenAi({
  apiKey: 'mock-api-key',
});

const client = instrumentOpenAiClient(mockClient);

// Test that manual instrumentation doesn't crash the browser
// The instrumentation automatically creates spans
const response = await client.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' },
  ],
  temperature: 0.7,
  max_tokens: 100,
});

console.log('Received response', response);
