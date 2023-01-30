import pako from 'pako';

export function compress(data: string): Uint8Array {
  return pako.deflate(data);
}
