import { decompressSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
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

    const restored = decompress(compressed);

    expect(restored).toBe(JSON.stringify(events));
  });

  it('throws on invalid/undefined events', () => {
    const compressor = new Compressor();

    // @ts-expect-error ignoring type for test
    expect(() => void compressor.addEvent(undefined)).toThrow();

    const compressed = compressor.finish();

    const restored = decompress(compressed);

    expect(restored).toBe(JSON.stringify([]));
  });
});

/** Decompress a compressed data payload. */
export function decompress(data: Uint8Array): string {
  if (!(data instanceof Uint8Array)) {
    throw new Error(`Data passed to decompress is not a Uint8Array: ${data}`);
  }
  const decompressed = decompressSync(data);
  return strFromU8(decompressed);
}
