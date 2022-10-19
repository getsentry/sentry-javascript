import { expect, it } from '@jest/globals';
import pako from 'pako';

import { Compressor } from './Compressor';

it('compresses multiple events', function () {
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

  compressor.addEvent(events[0]);

  compressor.addEvent(events[1]);

  const compressed = compressor.finish();

  const restored = pako.inflate(compressed, { to: 'string' });

  expect(restored).toBe(JSON.stringify(events));
});
