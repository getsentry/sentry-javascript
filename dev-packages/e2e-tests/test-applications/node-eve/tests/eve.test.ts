import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import { runAgentTurn } from './utils';

const APP = 'node-eve';

// eve serves one agent turn across two request contexts — the session API
// request (`POST /eve/v1/session`) and the internal durable-workflow request
// (`POST /.well-known/workflow/v1/flow`) — so the captured server path can be
// either one, depending on eve's workflow scheduling.
const EVE_AGENT_PATH = /(\/eve\/v1\/session|\/\.well-known\/workflow\/v1\/flow)/;

// The agent turn is served by a POST to one of eve's two agent paths. Requiring
// POST keeps the GET spans (health, the event stream) out even though
// EVE_AGENT_PATH also matches the stream path.
const isAgentServerSpan = (span: { attributes?: Record<string, { value?: unknown }> }): boolean =>
  getSpanOp(span) === 'http.server' &&
  span.attributes?.['http.request.method']?.value === 'POST' &&
  EVE_AGENT_PATH.test(String(span.attributes?.['url.path']?.value ?? ''));

test('captures Vercel AI agent spans (invoke_agent, generate_content, execute_tool) for an eve turn', async ({
  baseURL,
}) => {
  // The gen_ai spans and the agent http.server span share one trace, but the
  // still-open invoke_agent parent flushes on a timer in a separate envelope
  // from its completed children. `collectStreamedSpans` accumulates a trace's
  // spans across envelopes (unlike `waitForStreamedSpans`, which sees one
  // envelope at a time), so we wait until the whole trace has arrived.
  const traceSpansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      ['gen_ai.invoke_agent', 'gen_ai.generate_content', 'gen_ai.execute_tool'].every(op =>
        spansOfTrace.some(span => getSpanOp(span) === op),
      ) && spansOfTrace.some(isAgentServerSpan),
  );

  await runAgentTurn(baseURL!, 'What is the weather in Paris?');

  const traceSpans = await traceSpansPromise;

  const invokeAgent = traceSpans.find(span => getSpanOp(span) === 'gen_ai.invoke_agent');
  const generateContent = traceSpans.find(span => getSpanOp(span) === 'gen_ai.generate_content');
  const executeTool = traceSpans.find(span => getSpanOp(span) === 'gen_ai.execute_tool');

  expect(invokeAgent?.attributes?.['sentry.origin']?.value).toBe('auto.vercelai.channel');
  expect(invokeAgent?.attributes?.['gen_ai.operation.name']?.value).toBe('invoke_agent');
  expect(invokeAgent?.attributes?.['gen_ai.request.model']?.value).toBe('openai/gpt-4o-mini');
  expect(invokeAgent?.attributes?.['gen_ai.provider.name']?.value).toBe('openrouter');
  expect(typeof invokeAgent?.attributes?.['gen_ai.usage.input_tokens']?.value).toBe('number');
  expect(typeof invokeAgent?.attributes?.['gen_ai.usage.output_tokens']?.value).toBe('number');
  expect(typeof invokeAgent?.attributes?.['gen_ai.usage.total_tokens']?.value).toBe('number');

  expect(generateContent?.attributes?.['gen_ai.operation.name']?.value).toBe('generate_content');
  expect(generateContent?.attributes?.['gen_ai.request.model']?.value).toBe('openai/gpt-4o-mini');

  expect(executeTool?.attributes?.['gen_ai.operation.name']?.value).toBe('execute_tool');
  expect(executeTool?.attributes?.['gen_ai.tool.name']?.value).toBe('get_weather');

  // Inputs and outputs are recorded with the SDK's default data collection (no
  // `dataCollection` override), for both the model call and the tool call.
  expect(invokeAgent?.attributes?.['gen_ai.input.messages']?.value).toContain('What is the weather in Paris?');
  expect(typeof invokeAgent?.attributes?.['gen_ai.output.messages']?.value).toBe('string');
  expect(String(invokeAgent?.attributes?.['gen_ai.output.messages']?.value ?? '')).not.toBe('');

  expect(executeTool?.attributes?.['gen_ai.tool.call.arguments']?.value).toContain('Paris');
  // The tool returns `{ city, condition: 'Sunny', temperatureC: 22 }`.
  expect(executeTool?.attributes?.['gen_ai.tool.call.result']?.value).toContain('Sunny');

  // The agent turn is captured as an http.server span on one of eve's two agent
  // request paths (the other http.server spans — health and the event stream —
  // are not in this trace).
  const agentServerSpans = traceSpans.filter(isAgentServerSpan);
  expect(agentServerSpans.length).toBeGreaterThanOrEqual(1);

  for (const span of agentServerSpans) {
    expect(span).toMatchObject({
      // no parametrization available, so the server span name is just the method
      name: 'POST',
      attributes: {
        'sentry.origin': { value: 'auto.http.http_server', type: 'string' },
        'sentry.op': { value: 'http.server', type: 'string' },
        'sentry.segment.name.source': { value: 'url', type: 'string' },
        'sentry.kind': { value: 'server', type: 'string' },
        'url.path': { value: expect.stringMatching(EVE_AGENT_PATH), type: 'string' },
        'http.request.method': { value: 'POST', type: 'string' },
      },
    });
  }
});

test('captures errors thrown inside an eve tool', async ({ baseURL }) => {
  const errorPromise = waitForError(
    APP,
    event => event.exception?.values?.[0]?.value?.includes('Intentional eve tool failure') ?? false,
  );

  await runAgentTurn(baseURL!, 'Please call the tool that triggers a failure now.');

  const error = await errorPromise;

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: expect.stringContaining('Intentional eve tool failure'),
          mechanism: {
            type: 'auto.vercelai.channel',
            handled: false,
          },
        },
      ],
    },
    // The tool runs inside eve's durable workflow, so the error is attributed to
    // either the session request or the internal workflow request.
    transaction: expect.stringMatching(EVE_AGENT_PATH),
  });
});
