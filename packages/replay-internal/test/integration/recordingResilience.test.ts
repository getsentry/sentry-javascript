/**
 * @vitest-environment jsdom
 *
 * Reproduction tests for the "rrweb recording silently dies" bug.
 *
 * The symptom: ALL rrweb recording (DOM mutations, mouse, scroll, input) stops,
 * while the rest of the Replay integration keeps working.
 *
 * These tests use the REAL `@sentry-internal/rrweb` `record()` (NOT the
 * `mockRrweb` helper) so they exercise rrweb's actual callbackWrapper / lock /
 * unlock / re-throw behavior.
 *
 * IMPORTANT: do NOT import from `../..` (test/index.ts) in this file — it
 * re-exports `mockRrweb`, which `vi.mock()`s rrweb and would defeat the purpose.
 */
import { EventType, IncrementalSource, record } from '@sentry-internal/rrweb';
import { afterEach, describe, expect, it } from 'vitest';

// Identical to the errorHandler Sentry registers in src/integration.ts.
// It returns `undefined`, which makes rrweb's callbackWrapper RE-THROW.
const sentryErrorHandler = (err: unknown): void => {
  try {
    (err as { __rrweb__?: boolean }).__rrweb__ = true;
  } catch {
    // ignore
  }
};

// Let the MutationObserver microtask + a macrotask run so rrweb processes mutations.
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('Integration | recording resilience (real rrweb)', () => {
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    stop = undefined;
    document.body.innerHTML = '';
  });

  it('control: a DOM mutation is emitted as a rrweb event', async () => {
    const events: { type: number }[] = [];
    stop = record({
      emit: e => {
        events.push(e);
      },
      errorHandler: sentryErrorHandler,
    });

    await flush();
    const initialCount = events.length;
    expect(initialCount).toBeGreaterThan(0); // initial Meta + FullSnapshot

    document.body.appendChild(document.createElement('div'));
    await flush();

    expect(events.length).toBeGreaterThan(initialCount); // mutation recorded
  });

  // Documents the upstream rrweb hazard that motivates the emit-callback guard in
  // `getHandleRecordingEmit` (and an eventual try/finally around lock/unlock in the
  // rrweb fork): if the `emit` callback throws during a checkout, rrweb skips
  // `unlock()` and the mutation buffer stays locked forever. Sentry's emit handler
  // is now wrapped so it can never throw into this window.
  it('rrweb leaves the mutation buffer locked when emit throws during a checkout (upstream hazard)', async () => {
    type Ev = { type: number; data?: { source?: number } };
    const events: Ev[] = [];
    let throwOnFullSnapshot = false;

    const isMutation = (e: Ev): boolean =>
      e.type === EventType.IncrementalSnapshot && e.data?.source === IncrementalSource.Mutation;
    const isMouseInteraction = (e: Ev): boolean =>
      e.type === EventType.IncrementalSnapshot && e.data?.source === IncrementalSource.MouseInteraction;
    const count = (pred: (e: Ev) => boolean): number => events.filter(pred).length;

    const button = document.createElement('button');
    document.body.appendChild(button);

    stop = record({
      emit: e => {
        if (throwOnFullSnapshot && e.type === EventType.FullSnapshot) {
          throw new Error('boom: emit threw during checkout');
        }
        events.push(e as Ev);
      },
      errorHandler: sentryErrorHandler,
    });

    await flush();

    // Sanity: a DOM mutation is recorded before the throwing checkout.
    document.body.appendChild(document.createElement('div'));
    await flush();
    expect(count(isMutation)).toBeGreaterThan(0);

    // Trigger a checkout whose FullSnapshot emit throws. Because Sentry's
    // errorHandler returns `undefined`, rrweb re-throws it out to the caller,
    // skipping `unlock()` — leaving the mutation buffer permanently locked.
    throwOnFullSnapshot = true;
    expect(() => record.takeFullSnapshot(true)).toThrow(/boom/);
    throwOnFullSnapshot = false;

    const mutationsAfterLock = count(isMutation);
    const mouseAfterLock = count(isMouseInteraction);

    // Drive both a DOM mutation and a mouse interaction after the lock.
    document.body.appendChild(document.createElement('span'));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flush();

    // BUG: DOM mutations are dead forever (buffer locked)...
    expect(count(isMutation)).toBe(mutationsAfterLock);
    // ...while mouse interactions still flow (they bypass the mutation buffer).
    // This is why the symptom can look like "recording froze" (DOM stops).
    expect(count(isMouseInteraction)).toBeGreaterThan(mouseAfterLock);
  });
});
