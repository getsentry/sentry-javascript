import pako from 'pako';

import { Compressor } from '../../src/Compressor';

describe('Compressor', () => {
  it('compresses multiple events', () => {
    const compressor = new Compressor();

    const events = [
      {
        id: 1,
        foo: ['bar', 'baz'],
      },
      {
        id: 2,
        foo: [false],
      },
    ];

    events.forEach(event => compressor.addEvent(JSON.stringify(event)));

    const compressed = compressor.finish();

    const restored = pako.inflate(compressed, { to: 'string' });

    expect(restored).toBe(JSON.stringify(events));
  });

  it('throws on invalid/undefined events', () => {
    const compressor = new Compressor();

    // @ts-expect-error ignoring type for test
    expect(() => void compressor.addEvent(undefined)).toThrow();

    const compressed = compressor.finish();

    const restored = pako.inflate(compressed, { to: 'string' });

    expect(restored).toBe(JSON.stringify([]));
  });
});
