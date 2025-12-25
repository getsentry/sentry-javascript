import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../../../src/utils/ring-buffer';

describe('RingBuffer', () => {
  let drops: string[] = []
  const onDrop = (item: string) => drops.push(item)
  const rb = new RingBuffer({ capacity: 10, onDrop })

  it('is a ring buffer that records drops', () => {
    expect(rb.size).toBe(0);
    expect(rb.empty).toBe(true)
    expect(rb.full).toBe(false)
    expect(rb.peek()).toBe(undefined);
    for (const i of 'abcde'.split('')) {
      rb.push(i)
    }
    expect(rb.size).toBe(5)
    expect([...rb]).toStrictEqual('abcde'.split(''))
    for (const i of 'abcde'.split('')) {
      rb.push(i)
    }
    expect(rb.size).toBe(10)
    expect(rb.peek()).toBe('a');
    expect([...rb]).toStrictEqual('abcdeabcde'.split(''))
    for (const i of 'xyz'.split('')) {
      rb.push(i)
    }
    expect(drops).toStrictEqual('abc'.split(''));
    expect(rb.peek()).toBe('d');
    drops.length = 0;
    expect(rb.size).toBe(10)

    expect([...rb]).toStrictEqual('deabcdexyz'.split(''))
    rb.push('s')
    expect(drops).toStrictEqual(['d'])
    drops.length = 0;
    expect(rb.shift()).toBe('e')
    rb.push('t')
    expect(rb.shift()).toBe('a')
    rb.push('u')
    expect(rb.shift()).toBe('b')
    expect(rb.shift()).toBe('c')
    rb.push('v')
    expect(rb.shift()).toBe('d')
    expect([...rb]).toStrictEqual('exyzstuv'.split(''))
    expect(rb.pop()).toBe('v')
    expect([...rb]).toStrictEqual('exyzstu'.split(''))
    rb.clear()
    // second time to coverage hit the no-op case
    rb.clear()
    expect([...rb]).toStrictEqual([]);
    expect(rb.shift()).toBe(undefined)
    expect(rb.pop()).toBe(undefined)
    const letters = 'abcdefghijklmno'.split('')
    for (const i of letters) {
      rb.push(i)
    }
    expect(drops).toStrictEqual('abcde'.split(''))
    drops.length = 0;
    const expectPops = 'fghijklmno'.split('')
    let c: string | undefined;
    while ((c = rb.pop()) !== undefined) {
      expect(c).toBe(expectPops.pop())
    }
  })
})
