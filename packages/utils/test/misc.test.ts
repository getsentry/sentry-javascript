import { StackFrame } from '@sentry/types';

import {
  addContextToFrame,
  getEventDescription,
  getGlobalObject,
  parseRetryAfterHeader,
  stripUrlQueryAndFragment,
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

describe('getGlobalObject()', () => {
  test('should return the same object', () => {
    const backup = global.process;
    delete global.process;
    const first = getGlobalObject();
    const second = getGlobalObject();
    expect(first).toEqual(second);
    global.process = backup;
  });
});

describe('parseRetryAfterHeader', () => {
  test('no header', () => {
    expect(parseRetryAfterHeader(Date.now())).toEqual(60 * 1000);
  });

  test('incorrect header', () => {
    expect(parseRetryAfterHeader(Date.now(), 'x')).toEqual(60 * 1000);
  });

  test('delay header', () => {
    expect(parseRetryAfterHeader(Date.now(), '1337')).toEqual(1337 * 1000);
  });

  test('date header', () => {
    expect(
      parseRetryAfterHeader(new Date('Wed, 21 Oct 2015 07:28:00 GMT').getTime(), 'Wed, 21 Oct 2015 07:28:13 GMT'),
    ).toEqual(13 * 1000);
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

describe('stripQueryStringAndFragment', () => {
  const urlString = 'http://dogs.are.great:1231/yay/';
  const queryString = '?furry=yes&funny=very';
  const fragment = '#adoptnotbuy';

  it('strips query string from url', () => {
    const urlWithQueryString = `${urlString}${queryString}`;
    expect(stripUrlQueryAndFragment(urlWithQueryString)).toBe(urlString);
  });

  it('strips fragment from url', () => {
    const urlWithFragment = `${urlString}${fragment}`;
    expect(stripUrlQueryAndFragment(urlWithFragment)).toBe(urlString);
  });

  it('strips query string and fragment from url', () => {
    const urlWithQueryStringAndFragment = `${urlString}${queryString}${fragment}`;
    expect(stripUrlQueryAndFragment(urlWithQueryStringAndFragment)).toBe(urlString);
  });
});
