import { expect, test } from '@playwright/test';
import { collectStreamedSpans, waitForError } from '@sentry-internal/test-utils';
import { APP, attr, isChatSpan } from './utils';

test('captures an error thrown by a failed Mistral call', async ({ baseURL, request }) => {
  const model = 'no-such-model/capture';
  const errorPromise = waitForError(
    APP,
    event => !event.type && !!event.exception?.values?.[0]?.value?.includes(model),
  );

  const response = await request.get(`${baseURL}/chat-error?id=capture`);
  expect(response.status()).toBe(500);

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toContain('Mistral call failed');
  expect(errorEvent.transaction).toBe('GET /chat-error');
  expect(errorEvent.contexts?.trace?.trace_id).toMatch(/[a-f0-9]{32}/);
});

test('marks the gen_ai span errored and ties it to the captured error', async ({ baseURL, request }) => {
  const id = 'linked';
  const model = `no-such-model/${id}`;

  const errorPromise = waitForError(
    APP,
    event => !event.type && !!event.exception?.values?.[0]?.value?.includes(model),
  );
  // Every request to this route produces an equivalent-looking trace, so the predicate names the
  // per-request model rather than the route.
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => span.is_segment && span.name === 'GET /chat-error') &&
      spansOfTrace.some(span => attr(span, 'gen_ai.request.model') === model),
  );

  await request.get(`${baseURL}/chat-error?id=${id}`);

  const [errorEvent, spans] = await Promise.all([errorPromise, spansPromise]);
  const chatSpan = spans.find(isChatSpan)!;

  expect(chatSpan).toBeDefined();
  expect(chatSpan.status).not.toBe('ok');
  // No response was produced, so nothing should have been recorded from one.
  expect(attr(chatSpan, 'gen_ai.response.text')).toBeUndefined();
  expect(attr(chatSpan, 'gen_ai.output.messages')).toBeUndefined();

  expect(chatSpan.trace_id).toBe(errorEvent.contexts?.trace?.trace_id);
});
