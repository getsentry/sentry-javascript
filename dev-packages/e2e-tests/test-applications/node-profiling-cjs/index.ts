import * as assert from 'node:assert/strict';
import type { Envelope, ProfileChunkEnvelope } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const sentEnvelopes: Envelope[] = [];

Sentry.init({
  dsn: 'https://public@example.com/1',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1,
  profileSessionSampleRate: 1,
  profileLifecycle: 'trace',
  transport: () => ({
    send: envelope => {
      sentEnvelopes.push(envelope);
      return Promise.resolve({});
    },
    flush: () => Promise.resolve(true),
  }),
});

async function main(): Promise<void> {
  await Sentry.startSpan({ name: 'Precompile test' }, async () => {
    await new Promise(resolve => setTimeout(resolve, 1_000));
  });
  await Sentry.flush(2_000);

  const profileChunkEnvelopes = sentEnvelopes.filter(
    (envelope): envelope is ProfileChunkEnvelope => envelope[1][0]?.[0].type === 'profile_chunk',
  );
  assert.equal(profileChunkEnvelopes.length, 1);

  const [header, payload] = profileChunkEnvelopes[0][1][0];
  assert.deepEqual(header, { type: 'profile_chunk', platform: 'node' });
  assert.equal(payload.platform, 'node');
  assert.equal(payload.version, '2');
  assert.match(payload.profiler_id, /^[a-f0-9]{32}$/);
  assert.match(payload.chunk_id, /^[a-f0-9]{32}$/);
  assert.ok(payload.profile.samples.length > 1);
  assert.ok(payload.profile.stacks.length > 0);
}

void main();
