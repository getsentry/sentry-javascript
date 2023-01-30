import pako from 'pako';

import { compress } from '../../../worker/src/compress';

describe('Unit | worker | compress', () => {
  it('compresses multiple events', () => {
    const events = [
      {
        id: 2,
        foo: [false],
      },
    ];

    const compressed = compress(JSON.stringify(events));

    const restored = pako.inflate(compressed, { to: 'string' });

    expect(restored).toBe(JSON.stringify(events));
  });
});
