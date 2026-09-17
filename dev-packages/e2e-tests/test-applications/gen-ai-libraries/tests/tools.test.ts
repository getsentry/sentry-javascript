import { expect, test } from '@playwright/test';
import { waitForStreamedSpans } from '@sentry-internal/test-utils';
import { APP } from './constants';
import { attr, describeTree, isModelCallSpan, LIBRARIES } from './utils';

for (const library of LIBRARIES) {
  test(`${library.id}: a tool call is captured on the gen_ai spans`, async ({ baseURL }) => {
    const spansPromise = waitForStreamedSpans(APP, spans =>
      spans.some(span => JSON.stringify(span.attributes ?? {}).includes('get_weather')),
    );

    const response = await fetch(`${baseURL}/${library.id}/tools`);
    expect(response.status).toBe(200);

    const spans = await spansPromise;

    // The tool name has to surface somewhere on the gen_ai spans — as a tool definition, a recorded
    // tool call, or (Vercel AI) a dedicated execute-tool span.
    const mentionsTool = spans.some(span => JSON.stringify(span.attributes ?? {}).includes('get_weather'));
    expect(mentionsTool, `expected a span mentioning the tool in:\n${describeTree(spans)}`).toBe(true);

    // The direct-SDK libraries record the model's tool call on the model-call span itself.
    if (library.provider) {
      const chatSpan = spans.find(span => isModelCallSpan(span, library));
      expect(chatSpan, `expected a ${library.op} span in:\n${describeTree(spans)}`).toBeDefined();
      expect(attr(chatSpan!, 'gen_ai.response.tool_calls')).toContain('get_weather');
    }
  });
}
