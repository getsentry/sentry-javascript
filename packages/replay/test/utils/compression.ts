import { decompressSync, strFromU8 } from 'fflate';

/** Decompress a compressed data payload. */
export function decompress(data: Uint8Array): string {
  if (!(data instanceof Uint8Array)) {
    throw new Error(`Data passed to decompress is not a Uint8Array: ${data}`);
  }
  const decompressed = decompressSync(data);
  return strFromU8(decompressed);
}
