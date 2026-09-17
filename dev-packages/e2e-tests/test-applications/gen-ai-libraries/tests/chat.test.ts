import { expect, test } from '@playwright/test';
import { waitForStreamedSpans } from '@sentry-internal/test-utils';
import { APP } from './constants';
import { describeTree, expectCommonChatAttributes, isModelCallSpan, LIBRARIES } from './utils';

for (const library of LIBRARIES) {
  test(`${library.id}: a chat query emits a ${library.op} span`, async ({ baseURL }) => {
    const spansPromise = waitForStreamedSpans(APP, spans => spans.some(span => isModelCallSpan(span, library)));

    const response = await fetch(`${baseURL}/${library.id}/chat`);
    expect(response.status).toBe(200);

    const spans = await spansPromise;
    const modelSpan = spans.find(span => isModelCallSpan(span, library));

    expect(modelSpan, `expected a ${library.op} span in:\n${describeTree(spans)}`).toBeDefined();
    expectCommonChatAttributes(modelSpan!, library);
  });
}
