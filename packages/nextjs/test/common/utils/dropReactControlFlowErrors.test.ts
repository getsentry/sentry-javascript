import type { Event } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { dropReactControlFlowErrorsEventProcessor } from '../../../src/common/utils/dropReactControlFlowErrors';

describe('dropReactControlFlowErrorsEventProcessor', () => {
  it('drops a React postpone error', () => {
    const event: Event = { exception: { values: [{ type: 'Error', value: 'postponed' }] } };

    expect(
      dropReactControlFlowErrorsEventProcessor(event, {
        originalException: { $$typeof: Symbol.for('react.postpone') },
      }),
    ).toBeNull();
  });

  it('drops an error that Next.js throws to abort a prerender', () => {
    const event: Event = { exception: { values: [{ type: 'Error', value: 'prerender aborted' }] } };
    const error = Object.assign(new Error('prerender aborted'), { digest: 'HANGING_PROMISE_REJECTION' });

    expect(dropReactControlFlowErrorsEventProcessor(event, { originalException: error })).toBeNull();
  });

  it.each([
    "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render.",
    "Suspense Exception: This is not a real error, and should not leak into userspace. If you're seeing this, it's likely a bug in React.",
  ])('drops a Suspense exception: %s', value => {
    const event: Event = { exception: { values: [{ type: 'Error', value }] } };

    expect(dropReactControlFlowErrorsEventProcessor(event, {})).toBeNull();
  });

  it('keeps an error that is not thrown for control flow', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'id')");
    const event: Event = { exception: { values: [{ type: 'TypeError', value: error.message }] } };

    expect(dropReactControlFlowErrorsEventProcessor(event, { originalException: error })).toBe(event);
  });

  it('keeps a transaction event whose hint holds a React postpone', () => {
    const event: Event = { type: 'transaction', transaction: 'GET /dashboard' };

    expect(
      dropReactControlFlowErrorsEventProcessor(event, {
        originalException: { $$typeof: Symbol.for('react.postpone') },
      }),
    ).toBe(event);
  });
});
