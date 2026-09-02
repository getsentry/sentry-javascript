import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { callRpc } from './agent-socket';

const AGENT_INSTANCE = 'chat-rpc-instance';

test('creates an rpc span for a @callable() invocation on an AIChatAgent', async ({ baseURL }) => {
  // The rpc span is streamed before the webSocketMessage segment that owns it, so collect until the
  // segment of the same trace has arrived.
  const spansPromise = collectStreamedSpans(
    'cloudflare-agent',
    spans =>
      spans.some(span => getSpanOp(span) === 'rpc' && span.name === 'greet') &&
      spans.some(span => span.is_segment && span.name === 'webSocketMessage'),
  );

  await callRpc(baseURL!, { binding: 'my-chat-agent', instance: AGENT_INSTANCE, method: 'greet', args: ['World'] });

  const spans = await spansPromise;
  const rpcSpan = spans.find(span => getSpanOp(span) === 'rpc' && span.name === 'greet')!;

  expect(rpcSpan.attributes['sentry.op']?.value).toBe('rpc');
  expect(rpcSpan.attributes['sentry.origin']?.value).toBe('auto.faas.cloudflare.agents');
});
