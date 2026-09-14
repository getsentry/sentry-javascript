import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import { runAgentTurn } from './utils';

const APP = 'node-flue';

test('captures an error thrown inside a Flue tool and marks its span errored', async ({ baseURL }) => {
  const errorPromise = waitForError(
    APP,
    event => event.exception?.values?.[0]?.value === 'Intentional flue tool failure',
  );
  const spansPromise = collectStreamedSpans(APP, spansOfTrace =>
    spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.execute_tool'),
  );

  await runAgentTurn(baseURL!, 'failure-conversation', 'Please call fail_now to trigger a failure.');

  const error = await errorPromise;
  expect(error.exception?.values?.[0]?.value).toBe('Intentional flue tool failure');

  const spans = await spansPromise;
  const executeTool = spans.find(span => span.attributes?.['gen_ai.tool.name']?.value === 'fail_now');
  expect(executeTool?.status).toBe('error');
});
