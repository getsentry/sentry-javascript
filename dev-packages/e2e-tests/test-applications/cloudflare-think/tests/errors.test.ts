import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import { attr, isTurnOf, newAgentId, runAgentTurn, type StreamedSpan } from './utils';

const APP = 'cloudflare-think';

/**
 * A tool throw is not an agent failure: the AI SDK catches it, hands the error back to the model as
 * a tool result, and the turn carries on and usually answers. So the error has to reach Sentry from
 * the tool span itself, and the spans above it stay `ok` — the model calls did succeed.
 */
test('captures an error thrown inside a Think tool and marks its span errored', async ({ baseURL }) => {
  const agentId = newAgentId('tool-error');
  const ofThisTurn = isTurnOf(agentId);

  const errorPromise = waitForError(
    APP,
    event => event.exception?.values?.[0]?.value === 'Think tool failed on purpose',
  );

  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      ofThisTurn(spansOfTrace as StreamedSpan[]) &&
      spansOfTrace.some(span => attr(span as StreamedSpan, 'gen_ai.tool.name') === 'fail_now'),
  );

  await runAgentTurn(baseURL!, agentId, 'Please trigger a failure now.');

  const error = await errorPromise;
  const spans = await spansPromise;

  const exception = error.exception?.values?.[0];
  expect(exception?.type).toBe('Error');
  expect(exception?.value).toBe('Think tool failed on purpose');
  expect(exception?.mechanism?.type).toBe('auto.vercelai.channel');

  const toolSpan = spans.find(span => span.attributes?.['gen_ai.tool.name']?.value === 'fail_now');
  expect(getSpanOp(toolSpan!)).toBe('gen_ai.execute_tool');
  expect(toolSpan?.status).toBe('error');

  // The issue belongs to the same trace as the turn that produced it.
  expect(error.contexts?.trace?.trace_id).toBe(toolSpan?.trace_id);

  // The model calls around the failing tool succeeded, so only the tool span is errored.
  const modelCalls = spans.filter(span => getSpanOp(span) === 'gen_ai.generate_content');
  expect(modelCalls.length).toBeGreaterThan(0);
  for (const modelCall of modelCalls) {
    expect(modelCall.status).toBe('ok');
  }
});
