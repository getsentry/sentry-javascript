import type { Event, Mechanism, StackFrame } from '@sentry/types';

import {
  addContextToFrame,
  addExceptionMechanism,
  arrayify,
  checkOrSetAlreadyCaught,
  getEventDescription,
  uuid4,
} from '../src/misc';

describe('getEventDescription()', () => {
  test('message event', () => {
    expect(
      getEventDescription({
        message: 'Random message',
        exception: {
          values: [
            {
              type: 'SyntaxError',
              value: 'wat',
            },
          ],
        },
      }),
    ).toEqual('Random message');
  });

  test('exception event with just type', () => {
    expect(
      getEventDescription({
        exception: {
          values: [
            {
              type: 'SyntaxError',
            },
          ],
        },
      }),
    ).toEqual('SyntaxError');
  });

  test('exception event with just value', () => {
    expect(
      getEventDescription({
        exception: {
          values: [
            {
              value: 'wat',
            },
          ],
        },
      }),
    ).toEqual('wat');
  });

  test('exception event with type and value', () => {
    expect(
      getEventDescription({
        exception: {
          values: [
            {
              type: 'SyntaxError',
              value: 'wat',
            },
          ],
        },
      }),
    ).toEqual('SyntaxError: wat');
  });

  test('exception event with invalid type and value, but with event_id', () => {
    expect(
      getEventDescription({
        exception: {
          values: [
            {
              type: undefined,
              value: undefined,
            },
          ],
        },
        event_id: '123',
      }),
    ).toEqual('123');
  });

  test('exception event with invalid type and value and no event_id', () => {
    expect(
      getEventDescription({
        exception: {
          values: [
            {
              type: undefined,
              value: undefined,
            },
          ],
        },
      }),
    ).toEqual('<unknown>');
  });

  test('malformed event with just event_id', () => {
    expect(
      getEventDescription({
        event_id: '123',
      }),
    ).toEqual('123');
  });

  test('completely malformed event', () => {
    expect(
      getEventDescription({
        oh: 'come, on',
        really: '?',
      } as any),
    ).toEqual('<unknown>');
  });
});

describe('addContextToFrame', () => {
  const lines = [
    '1: a',
    '2: b',
    '3: c',
    '4: d',
    '5: e',
    '6: f',
    '7: g',
    '8: h',
    '9: i',
    '10: j',
    '11: k',
    '12: l',
    '13: m',
    '14: n',
  ];

  test('start of file', () => {
    const frame: StackFrame = {
      lineno: 0,
    };
    addContextToFrame(lines, frame);
    expect(frame.pre_context).toEqual([]);
    expect(frame.context_line).toEqual('1: a');
    expect(frame.post_context).toEqual(['2: b', '3: c', '4: d', '5: e', '6: f']);
  });

  test('mid of file', () => {
    const frame: StackFrame = {
      lineno: 4,
    };
    addContextToFrame(lines, frame);
    expect(frame.pre_context).toEqual(['1: a', '2: b', '3: c']);
    expect(frame.context_line).toEqual('4: d');
    expect(frame.post_context).toEqual(['5: e', '6: f', '7: g', '8: h', '9: i']);
  });

  test('end of file', () => {
    const frame: StackFrame = {
      lineno: 14,
    };
    addContextToFrame(lines, frame);
    expect(frame.pre_context).toEqual(['9: i', '10: j', '11: k', '12: l', '13: m']);
    expect(frame.context_line).toEqual('14: n');
    expect(frame.post_context).toEqual([]);
  });

  test('negative', () => {
    const frame: StackFrame = {
      lineno: -1,
    };
    addContextToFrame(lines, frame);
    expect(frame.pre_context).toEqual([]);
    expect(frame.context_line).toEqual('1: a');
    expect(frame.post_context).toEqual(['2: b', '3: c', '4: d', '5: e', '6: f']);
  });

  test('overshoot', () => {
    const frame: StackFrame = {
      lineno: 999,
    };
    addContextToFrame(lines, frame);
    expect(frame.pre_context).toEqual(['10: j', '11: k', '12: l', '13: m', '14: n']);
    expect(frame.context_line).toEqual('14: n');
    expect(frame.post_context).toEqual([]);
  });
});

describe('addExceptionMechanism', () => {
  const defaultMechanism = { type: 'generic', handled: true };

  type EventWithException = Event & {
    exception: {
      values: [{ type?: string; value?: string; mechanism?: Mechanism }];
    };
  };

  const baseEvent: EventWithException = {
    exception: { values: [{ type: 'Error', value: 'Oh, no! Charlie ate the flip-flops! :-(' }] },
  };

  it('uses default values', () => {
    const event = { ...baseEvent };

    addExceptionMechanism(event);

    expect(event.exception.values[0].mechanism).toEqual(defaultMechanism);
  });

  it('prefers current values to defaults', () => {
    const event = { ...baseEvent };

    const nonDefaultMechanism = { type: 'instrument', handled: false };
    event.exception.values[0].mechanism = nonDefaultMechanism;

    addExceptionMechanism(event);

    expect(event.exception.values[0].mechanism).toEqual(nonDefaultMechanism);
  });

  it('prefers incoming values to current values', () => {
    const event = { ...baseEvent };

    const currentMechanism = { type: 'instrument', handled: false };
    const newMechanism = { handled: true, synthetic: true };
    event.exception.values[0].mechanism = currentMechanism;

    addExceptionMechanism(event, newMechanism);

    // the new `handled` value took precedence
    expect(event.exception.values[0].mechanism).toEqual({ type: 'instrument', handled: true, synthetic: true });
  });

  it('merges data values', () => {
    const event = { ...baseEvent };

    const currentMechanism = { ...defaultMechanism, data: { function: 'addEventListener' } };
    const newMechanism = { data: { handler: 'organizeShoes', target: 'closet' } };
    event.exception.values[0].mechanism = currentMechanism;

    addExceptionMechanism(event, newMechanism);

    expect(event.exception.values[0].mechanism.data).toEqual({
      function: 'addEventListener',
      handler: 'organizeShoes',
      target: 'closet',
    });
  });
});

describe('checkOrSetAlreadyCaught()', () => {
  describe('ignores primitives', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['number', 1231],
      ['boolean', true],
      ['string', 'Dogs are great!'],
    ])('%s', (_case: string, exception: unknown): void => {
      // in this case, "ignore" just means reporting them as unseen without actually doing anything to them (which of
      // course it can't anyway, because primitives are immutable)
      expect(checkOrSetAlreadyCaught(exception)).toBe(false);
    });
  });

  it("recognizes exceptions it's seen before", () => {
    // `exception` can be any object - an `Error`, a class instance, or a plain object
    const exception = { message: 'Oh, no! Charlie ate the flip-flops! :-(', __sentry_captured__: true };

    expect(checkOrSetAlreadyCaught(exception)).toBe(true);
  });

  it('recognizes new exceptions as new and marks them as seen', () => {
    const exception = { message: 'Oh, no! Charlie ate the flip-flops! :-(' };

    expect(checkOrSetAlreadyCaught(exception)).toBe(false);
    expect((exception as any).__sentry_captured__).toBe(true);
  });
});

describe('uuid4 generation', () => {
  // Jest messes with the global object, so there is no global crypto object in any node version
  // For this reason we need to create our own crypto object for each test to cover all the code paths
  it('returns valid uuid v4 ids via Math.random', () => {
    for (let index = 0; index < 1_000; index++) {
      expect(uuid4()).toMatch(/^[0-9A-F]{12}[4][0-9A-F]{3}[89AB][0-9A-F]{15}$/i);
    }
  });

  it('returns valid uuid v4 ids via crypto.getRandomValues', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cryptoMod = require('crypto');

    (global as any).crypto = { getRandomValues: cryptoMod.getRandomValues };

    for (let index = 0; index < 1_000; index++) {
      expect(uuid4()).toMatch(/^[0-9A-F]{12}[4][0-9A-F]{3}[89AB][0-9A-F]{15}$/i);
    }
  });

  it('returns valid uuid v4 ids via crypto.randomUUID', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cryptoMod = require('crypto');

    (global as any).crypto = { randomUUID: cryptoMod.randomUUID };

    for (let index = 0; index < 1_000; index++) {
      expect(uuid4()).toMatch(/^[0-9A-F]{12}[4][0-9A-F]{3}[89AB][0-9A-F]{15}$/i);
    }
  });
});

describe('arrayify()', () => {
  it('returns arrays untouched', () => {
    expect(arrayify([])).toEqual([]);
    expect(arrayify(['dogs', 'are', 'great'])).toEqual(['dogs', 'are', 'great']);
  });

  it('wraps non-arrays with an array', () => {
    expect(arrayify(1231)).toEqual([1231]);
    expect(arrayify('dogs are great')).toEqual(['dogs are great']);
    expect(arrayify(true)).toEqual([true]);
    expect(arrayify({})).toEqual([{}]);
    expect(arrayify(null)).toEqual([null]);
    expect(arrayify(undefined)).toEqual([undefined]);
  });
});
