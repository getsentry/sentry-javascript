import { describe, expect, it } from 'vitest';
import { loadModule } from '../../../src/utils/node';

// vitest's `module` shim has no `require`, so tests hand in an explicit CJS-like module object.
const cjsModule = { require };

describe('loadModule', () => {
  it('loads a module via the given `existingModule`', () => {
    const path = loadModule<{ join: unknown }>('path', cjsModule);
    expect(path?.join).toBeTypeOf('function');
  });

  it('returns undefined for a module that cannot be resolved', () => {
    expect(loadModule('@sentry/this-module-does-not-exist', cjsModule)).toBeUndefined();
  });

  it('returns undefined instead of throwing when `existingModule` cannot require', () => {
    expect(loadModule('path', undefined)).toBeUndefined();
  });
});
