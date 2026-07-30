import type { Envelope, Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

it('cacheClient: false - two consecutive invocations get different isolation scopes', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('transaction', 'span').start(signal);

  await runner.makeRequestAndWaitForEnvelope('get', '/scope?seed=1', (envelope: Envelope) => {
    const event = envelope[1]?.[0]?.[1] as Event;
    expect(event.exception?.values?.[0]?.value).toBe('Scope seed');
    // Guards the probe assertions below against passing vacuously: the seeding invocation really
    // did write to its isolation scope.
    expect(event.tags).toEqual(expect.objectContaining({ seeded_tag: 'from-seeding-invocation' }));
    expect(event.user).toEqual({ id: 'user-from-seeding-invocation' });
  });

  await runner.makeRequestAndWaitForEnvelope('get', '/scope?seed=0', (envelope: Envelope) => {
    const event = envelope[1]?.[0]?.[1] as Event;
    expect(event.exception?.values?.[0]?.value).toBe('Scope probe');
    expect(event.tags?.seeded_tag).toBeUndefined();
    expect(event.user).toBeUndefined();
  });
});

it('a nested direct call within one invocation shares the same isolation scope', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('transaction', 'span').start(signal);

  await runner.makeRequestAndWaitForEnvelope('get', '/nested', (envelope: Envelope) => {
    const event = envelope[1]?.[0]?.[1] as Event;
    expect(event.exception?.values?.[0]?.value).toBe('Nested outer');
    // The event must carry data written on both sides of the nested call: `outer_tag` from
    // before it, `inner_tag` and the user from inside it — anything less means the nested
    // call ran in its own scope.
    expect(event.tags).toEqual(
      expect.objectContaining({
        outer_tag: 'from-outer-method',
        inner_tag: 'from-inner-method',
      }),
    );
    expect(event.user).toEqual({ id: 'user-from-inner-method' });
  });

  // Whatever the nested invocation wrote must not survive into the next invocation.
  await runner.makeRequestAndWaitForEnvelope('get', '/scope?seed=0', (envelope: Envelope) => {
    const event = envelope[1]?.[0]?.[1] as Event;
    expect(event.exception?.values?.[0]?.value).toBe('Scope probe');
    expect(event.tags?.outer_tag).toBeUndefined();
    expect(event.tags?.inner_tag).toBeUndefined();
    expect(event.user).toBeUndefined();
  });
});

it('a nested call into another instrumented handler shares the same isolation scope', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('transaction', 'span').start(signal);

  await runner.makeRequestAndWaitForEnvelope('get', '/reentrant', (envelope: Envelope) => {
    const event = envelope[1]?.[0]?.[1] as Event;
    expect(event.exception?.values?.[0]?.value).toBe('Reentrant inner');
    // `fetch` is itself instrumented and opens an isolation scope. Reached from inside the RPC
    // invocation it must not fork again, or it would not see what the RPC method set.
    expect(event.tags).toEqual(
      expect.objectContaining({
        reentrant_outer_tag: 'from-rpc-method',
        fetch_tag: 'from-nested-fetch',
      }),
    );
    expect(event.user).toEqual({ id: 'user-from-rpc-method' });
  });

  await runner.makeRequestAndWaitForEnvelope('get', '/scope?seed=0', (envelope: Envelope) => {
    const event = envelope[1]?.[0]?.[1] as Event;
    expect(event.exception?.values?.[0]?.value).toBe('Scope probe');
    expect(event.tags?.reentrant_outer_tag).toBeUndefined();
    expect(event.tags?.fetch_tag).toBeUndefined();
    expect(event.user).toBeUndefined();
  });
});
