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

  it('drops a Suspense exception', () => {
    const event: Event = {
      exception: { values: [{ type: 'Error', value: 'Suspense Exception: This is not a real error!' }] },
    };

    expect(dropReactControlFlowErrorsEventProcessor(event, {})).toBeNull();
  });

  it('keeps other errors and non-error events', () => {
    const errorEvent: Event = { exception: { values: [{ type: 'Error', value: 'boom' }] } };
    const transactionEvent: Event = { type: 'transaction', transaction: 'GET /' };

    expect(dropReactControlFlowErrorsEventProcessor(errorEvent, { originalException: new Error('boom') })).toBe(
      errorEvent,
    );
    expect(dropReactControlFlowErrorsEventProcessor(transactionEvent, {})).toBe(transactionEvent);
  });
});
