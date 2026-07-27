import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('receives agent events via a diagnostics_channel subscription in the DO isolate', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('event').start(signal);

  await runner.agents.callRpc({ binding: 'my-agent', instance: 'dc-instance', method: 'ping', args: [] });

  const res = await runner.makeRequest<{ count: number; events: string[] }>(
    'get',
    '/agents/my-agent/dc-instance/count',
  );

  expect(res?.count).toBeGreaterThanOrEqual(1);
  expect(res?.events).toContain('rpc');
});
