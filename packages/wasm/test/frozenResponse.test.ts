import { describe, expect, it, vi } from 'vitest';
import { patchWebAssembly } from '../src/patchWebAssembly';

// Kept in its own file because freezing `Response.prototype` cannot be undone
// and would leak into every other test sharing the environment.
describe('patchWebAssembly() with a frozen Response.prototype', () => {
  it('does not throw and still installs the streaming patch', async () => {
    Object.freeze(Response.prototype);

    const module = {} as WebAssembly.Module;
    WebAssembly.compileStreaming = vi.fn().mockResolvedValue(module) as unknown as typeof WebAssembly.compileStreaming;

    const registered: string[] = [];

    expect(() => patchWebAssembly((_module, url) => registered.push(url))).not.toThrow();

    await WebAssembly.compileStreaming({ url: 'http://localhost:8001/main.wasm' } as Response);

    expect(registered).toEqual(['http://localhost:8001/main.wasm']);
  });
});
