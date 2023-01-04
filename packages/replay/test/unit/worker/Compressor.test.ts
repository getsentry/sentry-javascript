import pako from 'pako';

import { Compressor } from '../../../worker/src/Compressor';

describe('Unit | worker | Compressor', () => {
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

    events.forEach(event => compressor.addEvent(event));

    const compressed = compressor.finish();

    const restored = pako.inflate(compressed, { to: 'string' });

    expect(restored).toBe(JSON.stringify(events));
  });

  it('ignores undefined events', () => {
    const compressor = new Compressor();

    const events = [
      {
        id: 1,
        foo: ['bar', 'baz'],
      },
      undefined,
      {
        id: 2,
        foo: [false],
      },
    ] as Record<string, any>[];

    events.forEach(event => compressor.addEvent(event));

    const compressed = compressor.finish();

    const restored = pako.inflate(compressed, { to: 'string' });

    const expected = [events[0], events[2]];
    expect(restored).toBe(JSON.stringify(expected));
  });
});
