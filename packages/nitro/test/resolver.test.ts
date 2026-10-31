import { describe, expect, it } from 'vitest';
import { createResolver } from '../src/utils/resolver';

describe('createResolver', () => {
  it('resolves relative to the directory of a file URL', () => {
    const resolver = createResolver(import.meta.url);

    expect(resolver.resolve('../src/utils/resolver.ts')).toMatch(/packages\/nitro\/src\/utils\/resolver\.ts$/);
  });

  it('never returns backslashes, so the path survives being written into an import string', () => {
    const resolver = createResolver(import.meta.url);

    expect(resolver.resolve('../runtime/plugins/server')).not.toContain('\\');
  });
});
