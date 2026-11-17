import { expect, test } from '@playwright/test';
import { callRpc } from './agent-socket';

const AGENT_INSTANCE = 'recovering-instance';

// `MyRecoveringAgent` throws on its first construction in the isolate, after `agents` has wrapped its
// `@callable()` methods. A retry of this test runs in the same isolate and cannot fail that first
// construction again, so it fails on the status check instead of passing without the failure.
test('keeps @callable() methods callable after the first Agent construction throws', async ({ baseURL, request }) => {
  const failedConstruction = await request.get(`${baseURL}/agents/my-recovering-agent/${AGENT_INSTANCE}`);

  expect(failedConstruction.status()).toBe(500);

  await expect(
    callRpc(baseURL!, { binding: 'my-recovering-agent', instance: AGENT_INSTANCE, method: 'greet', args: ['World'] }),
  ).resolves.toBe('Hello, World!');
});
