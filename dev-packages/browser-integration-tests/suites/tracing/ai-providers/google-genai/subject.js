import * as Sentry from '@sentry/browser';
import { MockGoogleGenAI } from './mocks.js';

// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Starting test...');

// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Creating mock client...');
const mockClient = new MockGoogleGenAI({
  apiKey: 'mock-api-key',
});

// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Mock client created:', mockClient);

// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Instrumenting client with Sentry...');
const client = Sentry.instrumentGoogleGenAIClient(mockClient);

// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Client instrumented:', client);

// Test that manual instrumentation doesn't crash the browser
// The instrumentation automatically creates spans
// Test both chats and models APIs
// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Creating chat...');
const chat = client.chats.create({
  model: 'gemini-1.5-pro',
  config: {
    temperature: 0.8,
    topP: 0.9,
    maxOutputTokens: 150,
  },
  history: [
    {
      role: 'user',
      parts: [{ text: 'Hello, how are you?' }],
    },
  ],
});

// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Sending message...');
const response = await chat.sendMessage({
  message: 'Tell me a joke',
});

// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Response received:', JSON.stringify(response));

// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Flushing Sentry...');
// Ensure transaction is flushed in CI
await Sentry.flush(2000);

// eslint-disable-next-line no-console
console.log('[Google GenAI Test] Test completed!');
