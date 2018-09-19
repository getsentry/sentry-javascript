import { getEventDescription } from '../src/misc';

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
