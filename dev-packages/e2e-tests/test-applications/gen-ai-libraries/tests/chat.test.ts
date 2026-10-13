import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';
import { APP } from './constants';
import { describeTree, expectCommonChatAttributes, isModelCallSpan, LIBRARIES, traceHasToolEvidence } from './utils';

for (const library of LIBRARIES) {
  test(`${library.id}: a chat query emits a ${library.op} span`, async ({ baseURL }) => {
    // Scope to this chat request's own trace: it carries this library's model-call span and, unlike the
    // tools request, no tool-call evidence — so a leftover trace from another request cannot satisfy it.
    const spansPromise = collectStreamedSpans(
      APP,
      spansOfTrace => spansOfTrace.some(span => isModelCallSpan(span, library)) && !traceHasToolEvidence(spansOfTrace),
    );

    const response = await fetch(`${baseURL}/${library.id}/chat`);
    expect(response.status).toBe(200);

    const spans = await spansPromise;
    const modelSpan = spans.find(span => isModelCallSpan(span, library));

    expect(modelSpan, `expected a ${library.op} span in:\n${describeTree(spans)}`).toBeDefined();
    expectCommonChatAttributes(modelSpan!, library);
  });
}
