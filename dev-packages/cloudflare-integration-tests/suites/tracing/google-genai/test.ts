import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not break in our
// cloudflare SDK.

it('traces Google GenAI chat creation and message sending', async () => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;

      expect(transactionEvent.transaction).toBe('GET /');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          // First span - chats.create
          expect.objectContaining({
            data: expect.objectContaining({
              'gen_ai.operation.name': 'chat',
              'sentry.op': 'gen_ai.chat',
              'sentry.origin': 'auto.ai.google_genai',
              'gen_ai.system': 'google_genai',
              'gen_ai.request.model': 'gemini-1.5-pro',
              'gen_ai.request.temperature': 0.8,
              'gen_ai.request.top_p': 0.9,
              'gen_ai.request.max_tokens': 150,
            }),
            description: 'chat gemini-1.5-pro create',
            op: 'gen_ai.chat',
            origin: 'auto.ai.google_genai',
          }),
          // Second span - chat.sendMessage
          expect.objectContaining({
            data: expect.objectContaining({
              'gen_ai.operation.name': 'chat',
              'sentry.op': 'gen_ai.chat',
              'sentry.origin': 'auto.ai.google_genai',
              'gen_ai.system': 'google_genai',
              'gen_ai.request.model': 'gemini-1.5-pro',
              'gen_ai.usage.input_tokens': 8,
              'gen_ai.usage.output_tokens': 12,
              'gen_ai.usage.total_tokens': 20,
            }),
            description: 'chat gemini-1.5-pro',
            op: 'gen_ai.chat',
            origin: 'auto.ai.google_genai',
          }),
          // Third span - models.generateContent
          expect.objectContaining({
            data: expect.objectContaining({
              'gen_ai.operation.name': 'generate_content',
              'sentry.op': 'gen_ai.generate_content',
              'sentry.origin': 'auto.ai.google_genai',
              'gen_ai.system': 'google_genai',
              'gen_ai.request.model': 'gemini-1.5-flash',
              'gen_ai.request.temperature': 0.7,
              'gen_ai.request.top_p': 0.9,
              'gen_ai.request.max_tokens': 100,
              'gen_ai.usage.input_tokens': 8,
              'gen_ai.usage.output_tokens': 12,
              'gen_ai.usage.total_tokens': 20,
            }),
            description: 'generate_content gemini-1.5-flash',
            op: 'gen_ai.generate_content',
            origin: 'auto.ai.google_genai',
          }),
        ]),
      );
    })
    .start();
  await runner.makeRequest('get', '/');
  await runner.completed();
});
