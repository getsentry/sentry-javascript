import { keysToEventMessage, truncate } from '../src/string';

describe('truncate()', () => {
  test('it works as expected', () => {
    expect(truncate('lolol', 3)).toEqual('lol...');
    expect(truncate('lolol', 10)).toEqual('lolol');
    expect(truncate('1'.repeat(1000), 300)).toHaveLength(303);
    expect(truncate(new Array(1000).join('f'), 0)).toEqual(new Array(1000).join('f'));
    expect(truncate(new Array(1000).join('f'), 0)).toEqual(new Array(1000).join('f'));
  });
});

describe('keysToEventMessage()', () => {
  test('no keys', () => {
    expect(keysToEventMessage([], 10)).toEqual('[object has no keys]');
  });

  test('one key should be returned as a whole if not over the length limit', () => {
    expect(keysToEventMessage(['foo'], 10)).toEqual('foo');
    expect(keysToEventMessage(['foobarbazx'], 10)).toEqual('foobarbazx');
  });

  test('one key should be appended with ... and truncated when over the limit', () => {
    expect(keysToEventMessage(['foobarbazqux'], 10)).toEqual('foobarbazq...');
  });

  test('multiple keys should be joined as a whole if not over the length limit', () => {
    expect(keysToEventMessage(['foo', 'bar'], 10)).toEqual('foo, bar');
  });

  test('multiple keys should include only as much keys as can fit into the limit', () => {
    expect(keysToEventMessage(['foo', 'bar', 'baz'], 10)).toEqual('foo, bar');
    expect(keysToEventMessage(['foo', 'verylongkey', 'baz'], 10)).toEqual('foo');
  });

  test('multiple keys should truncate first key if its too long', () => {
    expect(keysToEventMessage(['foobarbazqux', 'bar', 'baz'], 10)).toEqual('foobarbazq...');
  });
});
