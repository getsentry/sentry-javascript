import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpans } from '@sentry-internal/test-utils';

const APP = 'node-eve';

// eve serves one agent turn across two request contexts — the session API
// request (`POST /eve/v1/session`) and the internal durable-workflow request
// (`POST /.well-known/workflow/v1/flow`) — so the captured server path can be
// either one, depending on eve's workflow scheduling.
const EVE_AGENT_PATH = /(\/eve\/v1\/session|\/\.well-known\/workflow\/v1\/flow)/;


/**
 * Drive one agent turn through eve's default HTTP channel and wait for it to
 * settle, so the agent has finished and its spans have been flushed before we
 * assert. eve runs the turn in a durable workflow, so the POST only needs to be
 * accepted; we drain the event stream to know when the turn is done.
 */
async function runAgentTurn(baseURL: string, message: string): Promise<void> {
  const createRes = await fetch(`${baseURL}/eve/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  expect(createRes.status).toBe(202);
  const { sessionId } = (await createRes.json()) as { sessionId: string };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const streamRes = await fetch(`${baseURL}/eve/v1/session/${sessionId}/stream`, {
      signal: controller.signal,
    });
    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes('"type":"session.waiting"') || buffer.includes('"type":"turn.failed"')) {
        break;
      }
    }
    await reader.cancel().catch(() => {});
  } finally {
    clearTimeout(timer);
  }
}

test('captures Vercel AI agent spans (invoke_agent, generate_content, execute_tool) for an eve turn', async ({
  baseURL,
}) => {
  const genAiSpansPromise = waitForStreamedSpans(APP, spans =>
    ['gen_ai.invoke_agent', 'gen_ai.generate_content', 'gen_ai.execute_tool'].every(op =>
      spans.some(span => getSpanOp(span) === op),
    ),
  );
  const httpServerSpanPromise = waitForStreamedSpans(APP, spans =>
    spans.some(
      span =>
        getSpanOp(span) === 'http.server' &&
        EVE_AGENT_PATH.test(String(span.attributes?.['url.path']?.value ?? '')),
    ),
  );

  await runAgentTurn(baseURL!, 'What is the weather in Paris?');

  const genAiSpans = await genAiSpansPromise;

  const invokeAgent = genAiSpans.find(span => getSpanOp(span) === 'gen_ai.invoke_agent');
  const generateContent = genAiSpans.find(span => getSpanOp(span) === 'gen_ai.generate_content');
  const executeTool = genAiSpans.find(span => getSpanOp(span) === 'gen_ai.execute_tool');

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

  // The agent turn is captured as an http.server span on one of eve's two agent
  // request paths (the other http.server spans — health and the event stream —
  // are filtered out).
  const allSpans = await httpServerSpanPromise;
  const agentServerSpans = allSpans.filter(
    span =>
      getSpanOp(span) === 'http.server' &&
      EVE_AGENT_PATH.test(String(span.attributes?.['url.path']?.value ?? '')),
  );
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
