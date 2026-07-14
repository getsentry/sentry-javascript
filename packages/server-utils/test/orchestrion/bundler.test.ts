import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTracingHooksDirectory } from '../../src/orchestrion/bundler/webpack';

describe('getTracingHooksDirectory', () => {
  it('returns the tracing-hooks package directory with the runtime hook entry points', () => {
    const dir = getTracingHooksDirectory();

    expect(dir).not.toContain('\\');
    // The runtime module hook loads these files by joining them onto the directory.
    expect(existsSync(join(dir, 'hook-sync.mjs'))).toBe(true);
    expect(existsSync(join(dir, 'hook.mjs'))).toBe(true);
    expect(existsSync(join(dir, 'package.json'))).toBe(true);
  });
});
