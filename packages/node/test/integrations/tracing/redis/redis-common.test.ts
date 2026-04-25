/*
 * Tests ported from @opentelemetry/redis-common@0.38.2
 * Original source: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/redis-common
 * Licensed under the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';
import { defaultDbStatementSerializer } from '../../../../src/integrations/tracing/redis/vendored/redis-common';

describe('defaultDbStatementSerializer()', () => {
  const testCases: Array<{
    cmdName: string;
    cmdArgs: Array<string | number | Buffer>;
    expected: string;
  }> = [
    {
      cmdName: 'UNKNOWN',
      cmdArgs: ['something'],
      expected: 'UNKNOWN [1 other arguments]',
    },
    {
      cmdName: 'ECHO',
      cmdArgs: ['echo'],
      expected: 'ECHO [1 other arguments]',
    },
    {
      cmdName: 'LPUSH',
      cmdArgs: ['list', 'value'],
      expected: 'LPUSH list [1 other arguments]',
    },
    {
      cmdName: 'HSET',
      cmdArgs: ['hash', 'field', 'value'],
      expected: 'HSET hash field [1 other arguments]',
    },
    {
      cmdName: 'INCRBY',
      cmdArgs: ['key', 5],
      expected: 'INCRBY key 5',
    },
    {
      cmdName: 'GET',
      cmdArgs: ['mykey'],
      expected: 'GET mykey',
    },
    {
      cmdName: 'SET',
      cmdArgs: ['mykey', 'myvalue'],
      expected: 'SET mykey [1 other arguments]',
    },
    {
      cmdName: 'MSET',
      cmdArgs: ['key1', 'val1', 'key2', 'val2'],
      expected: 'MSET key1 [3 other arguments]',
    },
    {
      cmdName: 'HSET',
      cmdArgs: ['myhash', 'field1', 'Hello'],
      expected: 'HSET myhash field1 [1 other arguments]',
    },
    {
      cmdName: 'SET',
      cmdArgs: [],
      expected: 'SET',
    },
    {
      cmdName: 'DEL',
      cmdArgs: ['key1', 'key2'],
      expected: 'DEL key1 key2',
    },
    {
      cmdName: 'ZADD',
      cmdArgs: ['myset', '1', 'one', '2', 'two'],
      expected: 'ZADD myset [4 other arguments]',
    },
  ];

  it.each(testCases)(
    'should serialize the correct number of arguments for $cmdName',
    ({ cmdName, cmdArgs, expected }) => {
      expect(defaultDbStatementSerializer(cmdName, cmdArgs as any)).toBe(expected);
    },
  );

  it('should handle empty args array', () => {
    expect(defaultDbStatementSerializer('GET', [])).toBe('GET');
  });

  it('should handle Buffer arguments', () => {
    const result = defaultDbStatementSerializer('GET', [Buffer.from('mykey')]);
    expect(result).toBe('GET mykey');
  });
});
