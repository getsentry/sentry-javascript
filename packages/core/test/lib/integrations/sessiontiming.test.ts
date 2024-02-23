import type { Event } from '@sentry/types';
import { sessionTimingIntegration } from '../../../src/integrations/sessiontiming';

const sessionTiming = sessionTimingIntegration();

describe('SessionTiming', () => {
  it('should work as expected', () => {
    const event = sessionTiming.processEvent?.(
      {
        extra: {
          some: 'value',
        },
      },
      {},
      {} as any,
    ) as Event;

    expect(typeof event.extra?.['session:start']).toBe('number');
    expect(typeof event.extra?.['session:duration']).toBe('number');
    expect(typeof event.extra?.['session:end']).toBe('number');
    expect(event.extra?.some).toEqual('value');
  });
});
