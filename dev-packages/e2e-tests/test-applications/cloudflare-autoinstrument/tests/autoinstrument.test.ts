import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { callRpc } from './agent-socket';

// The worker entry (`src/index.ts`) contains no Sentry calls at all — every
// wrapper below was injected by the Vite auto-instrument plugin at build time.
// Any span arriving here therefore proves the injection happened.
//
// With span streaming, URL-sourced `http.server` spans are named by method only, so the
// `/plain-do` request segment is identified by its `url.path` attribute.

test('wraps the default export with withSentry (options from instrument.server.ts)', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan(
    'cloudflare-autoinstrument',
    span => getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === '/plain-do',
  );

  const res = await fetch(`${baseURL}/plain-do`);
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ durableObject: true });

  const span = await spanPromise;

  expect(span.attributes['sentry.origin']?.value).toBe('auto.http.cloudflare');
  // `environment: 'qa'` is only set in `instrument.server.ts`, so seeing it here
  // proves the plugin sourced its options callback from that file rather than
  // falling back to reading configuration off `env`.
  expect(span.attributes['sentry.environment']?.value).toBe('qa');
});

// Each of these three classes is registered in wrangler.jsonc exactly like the
// plain Durable Object below — only the base-class chain marks them as Agents.
// An `rpc` span with origin `auto.faas.cloudflare.agents` is produced solely by
// `instrumentAgentWithSentry`, so its presence is what distinguishes a correct
// agent upgrade from a plain `instrumentDurableObjectWithSentry` wrap.
for (const { title, binding, agentClass } of [
  {
    title: 'an Agent subclass declared in the entry',
    binding: 'my-agent',
    agentClass: 'MyAgent',
  },
  {
    title: 'an AIChatAgent subclass declared in the entry',
    binding: 'my-chat-agent',
    agentClass: 'MyChatAgent',
  },
  {
    title: 'an Agent subclass whose base class lives in another module',
    binding: 'derived-agent',
    agentClass: 'DerivedAgent',
  },
]) {
  test(`applies agent instrumentation to ${title}`, async ({ baseURL }) => {
    const instance = `${binding}-instance`;

    // The rpc span is a child of the `webSocketMessage` segment span, which ends after it and is
    // streamed in a later envelope, so collect until both have arrived.
    const spansPromise = collectStreamedSpans(
      'cloudflare-autoinstrument',
      spans =>
        spans.some(
          span =>
            getSpanOp(span) === 'rpc' &&
            span.name === 'greet' &&
            String(span.attributes['gen_ai.agent.name']?.value ?? '').includes(agentClass),
        ) && spans.some(span => span.is_segment && span.name === 'webSocketMessage'),
    );

    // Each agent's greet() returns a string naming its class, so the reply
    // identifies exactly which class handled the call.
    const reply = await callRpc(baseURL!, { binding, instance, method: 'greet', args: ['World'] });
    expect(reply).toBe(`Hello, World! (from ${agentClass})`);

    const spans = await spansPromise;
    const rpcSpan = spans.find(
      span =>
        getSpanOp(span) === 'rpc' &&
        span.name === 'greet' &&
        String(span.attributes['gen_ai.agent.name']?.value ?? '').includes(agentClass),
    )!;

    expect(rpcSpan.attributes['sentry.op']?.value).toBe('rpc');
    expect(rpcSpan.attributes['sentry.origin']?.value).toBe('auto.faas.cloudflare.agents');
    // Read back off the instance at runtime (`_ParentClass.name`), so it
    // confirms the wrapper landed on the user's real class. Matched loosely
    // because the transform renames the class it wraps to
    // `__SENTRY_ORIGINAL_<name>__` and the bundler infers that name.
    expect(rpcSpan.attributes['gen_ai.agent.name']?.value).toContain(agentClass);
  });
}

test('applies plain Durable Object instrumentation to a non-Agent class', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans('cloudflare-autoinstrument', spans =>
    spans.some(
      span =>
        getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === '/plain-do',
    ),
  );

  const res = await fetch(`${baseURL}/plain-do`);
  expect(res.status).toBe(200);

  const spans = await spansPromise;

  // A plain Durable Object must NOT pick up agent instrumentation: detection has
  // to discriminate, not blanket-upgrade every `durable_objects` binding.
  const agentSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.faas.cloudflare.agents');
  expect(agentSpans).toEqual([]);
});
