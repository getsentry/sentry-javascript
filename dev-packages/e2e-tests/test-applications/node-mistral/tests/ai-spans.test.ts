import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';
import { APP, attr, expectCommonChatAttributes, isChatSpan } from './utils';

test('emits a gen_ai.chat span for a non-streaming call', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP, 'GET /chat');

  const response = await request.get(`${baseURL}/chat`);
  expect(response.status()).toBe(200);
  expect((await response.json()).answer).toBeTruthy();

  const spans = await spansPromise;
  const chatSpan = spans.find(isChatSpan);

  expect(chatSpan).toBeDefined();
  expectCommonChatAttributes(chatSpan!);
  expect(attr(chatSpan!, 'gen_ai.request.stream')).toBe(false);
  expect(attr(chatSpan!, 'gen_ai.request.temperature')).toBe(0);
  expect(attr(chatSpan!, 'gen_ai.request.max_tokens')).toBe(32);
});

test('emits a gen_ai.chat span for a streaming call', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP, 'GET /chat-stream');

  const response = await request.get(`${baseURL}/chat-stream`);
  expect(response.status()).toBe(200);
  expect((await response.json()).answer).toBeTruthy();

  const spans = await spansPromise;
  const streamSpan = spans.find(isChatSpan);

  expect(streamSpan).toBeDefined();
  expectCommonChatAttributes(streamSpan!);
  // Set from the called method: v2's `stream` request field is optional and the app never passes it.
  expect(attr(streamSpan!, 'gen_ai.request.stream')).toBe(true);
  expect(attr(streamSpan!, 'gen_ai.response.streaming')).toBe(true);
});

test('records inputs and outputs in the shape the gen_ai conventions specify', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP, 'GET /chat');

  await request.get(`${baseURL}/chat`);

  const spans = await spansPromise;
  const chatSpan = spans.find(isChatSpan)!;

  // The system message is split out from the rest of the prompt.
  expect(attr(chatSpan, 'gen_ai.system_instructions')).toContain('automated test');
  expect(attr(chatSpan, 'gen_ai.input.messages')).toContain('capital of France');

  // A stringified array of messages, not one concatenated string.
  const responseText = JSON.parse(attr(chatSpan, 'gen_ai.response.text') as string);
  expect(Array.isArray(responseText)).toBe(true);
  expect(responseText).toHaveLength(1);
  expect(typeof responseText[0]).toBe('string');

  const outputMessages = JSON.parse(attr(chatSpan, 'gen_ai.output.messages') as string);
  expect(outputMessages).toEqual([
    {
      role: 'assistant',
      parts: [{ type: 'text', content: expect.any(String) }],
      finish_reason: expect.any(String),
    },
  ]);
});
