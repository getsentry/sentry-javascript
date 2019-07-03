import { SessionTiming } from '../src/sessiontiming';

const sessionTiming: SessionTiming = new SessionTiming();

describe('SessionTiming', () => {
  it('should work as expected', () => {
    const event = sessionTiming.process({
      extra: {
        some: 'value',
      },
    });

    expect(typeof event.extra!['session:start']).toBe('number');
    expect(typeof event.extra!['session:duration']).toBe('number');
    expect(typeof event.extra!['session:end']).toBe('number');
    expect(event.extra!.some).toEqual('value');
  });
});
