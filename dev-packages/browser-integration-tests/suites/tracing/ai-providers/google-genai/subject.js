import { instrumentGoogleGenAIClient } from '@sentry/browser';
import { MockGoogleGenAI } from './mocks.js';

const mockClient = new MockGoogleGenAI({
  apiKey: 'mock-api-key',
});

const client = instrumentGoogleGenAIClient(mockClient);

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

const response = await chat.sendMessage({
  message: 'Tell me a joke',
});

console.log('Received response', response);

// Test embedContent
const embedResponse = await client.models.embedContent({
  model: 'text-embedding-004',
  contents: 'Hello world',
});

console.log('Received embed response', embedResponse);
