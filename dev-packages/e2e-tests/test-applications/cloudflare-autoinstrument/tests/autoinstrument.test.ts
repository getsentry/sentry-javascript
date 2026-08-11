import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { callRpc } from './agent-socket';

// The worker entry (`src/index.ts`) contains no Sentry calls at all — every
// wrapper below was injected by the Vite auto-instrument plugin at build time.
// Any transaction arriving here therefore proves the injection happened.

test('wraps the default export with withSentry (options from instrument.server.ts)', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-autoinstrument', event => {
    return event.contexts?.trace?.op === 'http.server' && (event.request?.url ?? '').includes('/plain-do');
  });

  const res = await fetch(`${baseURL}/plain-do`);
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ durableObject: true });

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.origin).toBe('auto.http.cloudflare');
  // `environment: 'qa'` is only set in `instrument.server.ts`, so seeing it here
  // proves the plugin sourced its options callback from that file rather than
  // falling back to reading configuration off `env`.
  expect(transaction.environment).toBe('qa');
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
  {
    title: 'an Agent imported from another module and exported by specifier',
    binding: 'imported-agent',
    agentClass: 'ImportedAgent',
  },
  {
    title: 'an Agent re-exported straight from another module',
    binding: 're-exported-agent',
    agentClass: 'ReExportedAgent',
  },
]) {
  test(`applies agent instrumentation to ${title}`, async ({ baseURL }) => {
    const instance = `${binding}-instance`;

    const transactionPromise = waitForTransaction('cloudflare-autoinstrument', event => {
      return (
        event.transaction === 'webSocketMessage' &&
        (event.spans ?? []).some(span => span.op === 'rpc' && span.description === 'greet')
      );
    });

    // Each agent's greet() returns a string naming its class, so the reply
    // identifies exactly which class handled the call.
    const reply = await callRpc(baseURL!, { binding, instance, method: 'greet', args: ['World'] });
    expect(reply).toBe(`Hello, World! (from ${agentClass})`);

    const transaction = await transactionPromise;
    const rpcSpan = (transaction.spans ?? []).find(span => span.op === 'rpc' && span.description === 'greet');

    expect(rpcSpan).toEqual(
      expect.objectContaining({
        op: 'rpc',
        description: 'greet',
        origin: 'auto.faas.cloudflare.agents',
        data: expect.objectContaining({
          // Read back off the instance at runtime (`_ParentClass.name`), so it
          // confirms the wrapper landed on the user's real class. Matched loosely
          // because the transform renames the class it wraps to
          // `__SENTRY_ORIGINAL_<name>__` and the bundler infers that name.
          'gen_ai.agent.name': expect.stringContaining(agentClass),
        }),
      }),
    );
  });
}

test('applies plain Durable Object instrumentation to a non-Agent class', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-autoinstrument', event => {
    return event.contexts?.trace?.op === 'http.server' && (event.request?.url ?? '').includes('/plain-do');
  });

  const res = await fetch(`${baseURL}/plain-do`);
  expect(res.status).toBe(200);

  const transaction = await transactionPromise;

  // A plain Durable Object must NOT pick up agent instrumentation: detection has
  // to discriminate, not blanket-upgrade every `durable_objects` binding.
  const agentSpans = (transaction.spans ?? []).filter(span => span.origin === 'auto.faas.cloudflare.agents');
  expect(agentSpans).toEqual([]);
});
