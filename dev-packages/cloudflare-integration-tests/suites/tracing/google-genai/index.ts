import * as Sentry from '@sentry/cloudflare';
import type { GoogleGenAIClient } from '@sentry/core';
import { MockGoogleGenAI } from './mocks';

interface Env {
  SENTRY_DSN: string;
}

const mockClient = new MockGoogleGenAI({
  apiKey: 'mock-api-key',
});

const client: GoogleGenAIClient = Sentry.instrumentGoogleGenAIClient(mockClient);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(_request, _env, _ctx) {
      // Test 1: chats.create and sendMessage flow
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

      const chatResponse = await chat.sendMessage({
        message: 'Tell me a joke',
      });

      // Test 2: models.generateContent
      const modelResponse = await client.models.generateContent({
        model: 'gemini-1.5-flash',
        config: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 100,
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: 'What is the capital of France?' }],
          },
        ],
      });

      return new Response(JSON.stringify({ chatResponse, modelResponse }));
    },
  },
);
