import * as Sentry from '@sentry/browser';
import { MockGoogleGenAI } from './mocks.js';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
});

const mockClient = new MockGoogleGenAI({
  apiKey: 'mock-api-key',
});

const client = Sentry.instrumentGoogleGenAIClient(mockClient);

// Test that manual instrumentation doesn't crash the browser
// The instrumentation automatically creates spans
// Test both chats and models APIs
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

chat.sendMessage({
  message: 'Tell me a joke',
})

