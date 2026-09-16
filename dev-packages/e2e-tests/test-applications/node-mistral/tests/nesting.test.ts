import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';
import { ancestorIds, APP, byName, describeTree, isChatSpan } from './utils';

test('nests the manual span under the request span and the gen_ai span under the manual span', async ({
  baseURL,
  request,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP, 'GET /chat');

  await request.get(`${baseURL}/chat`);

  const spans = await spansPromise;
  const tree = describeTree(spans);

  const segment = spans.find(span => span.is_segment && span.name === 'GET /chat')!;
  const workflow = byName(spans, 'ai-workflow');
  const postProcess = byName(spans, 'post-process');
  const chatSpan = spans.find(isChatSpan)!;

  // Manual span inside the generated request span. Express contributes its own middleware and
  // request-handler spans in between, so this is an ancestry check, not a direct-parent one.
  expect(ancestorIds(spans, workflow), `ai-workflow is not under the request span:\n${tree}`).toContain(
    segment.span_id,
  );

  // Generated span directly inside the manual one: nothing should slip between them.
  expect(chatSpan.parent_span_id, `gen_ai span is not a child of ai-workflow:\n${tree}`).toBe(workflow.span_id);

  // A second manual span, sibling of the gen_ai span rather than its child.
  expect(postProcess.parent_span_id, `post-process is not a child of ai-workflow:\n${tree}`).toBe(workflow.span_id);

  for (const span of [workflow, postProcess, chatSpan]) {
    expect(span.trace_id).toBe(segment.trace_id);
  }
});

test('nests the streaming gen_ai span under its manual parent', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP, 'GET /chat-stream');

  await request.get(`${baseURL}/chat-stream`);

  const spans = await spansPromise;
  const tree = describeTree(spans);

  const segment = spans.find(span => span.is_segment && span.name === 'GET /chat-stream')!;
  const workflow = byName(spans, 'ai-stream-workflow');
  const streamSpan = spans.find(isChatSpan)!;

  expect(ancestorIds(spans, workflow), `ai-stream-workflow is not under the request span:\n${tree}`).toContain(
    segment.span_id,
  );

  // The stream is drained inside the manual span, so the gen_ai span has to close under it rather
  // than escaping to the request root.
  expect(streamSpan.parent_span_id, `streamed gen_ai span is not a child of ai-stream-workflow:\n${tree}`).toBe(
    workflow.span_id,
  );
  expect(streamSpan.trace_id).toBe(segment.trace_id);
});
