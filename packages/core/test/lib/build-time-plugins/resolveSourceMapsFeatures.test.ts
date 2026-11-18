import { describe, expect, it } from 'vitest';
import { resolveSourceMapsFeatures } from '../../../src/build-time-plugins/resolveSourceMapsFeatures';

describe('resolveSourceMapsFeatures', () => {
  it.each([
    [undefined, { injectDebugIds: true, upload: true }],
    [{}, { injectDebugIds: true, upload: true }],
    [{ upload: true }, { injectDebugIds: true, upload: true }],
    [{ upload: false }, { injectDebugIds: true, upload: false }],
    [{ injectDebugIds: true }, { injectDebugIds: true, upload: true }],
    [{ injectDebugIds: false }, { injectDebugIds: false, upload: false }],
    [
      { upload: false, injectDebugIds: false },
      { injectDebugIds: false, upload: false },
    ],
    [
      { upload: true, injectDebugIds: false },
      { injectDebugIds: false, upload: false },
    ],
  ] as const)('reads %j', (sourcemaps, expected) => {
    expect(resolveSourceMapsFeatures(sourcemaps)).toEqual(expected);
  });

  it.each([
    [{ disable: false }, { injectDebugIds: true, upload: true }],
    [{ disable: true }, { injectDebugIds: false, upload: false, legacyDisable: true }],
    [{ disable: 'disable-upload' }, { injectDebugIds: true, upload: false, legacyDisable: 'disable-upload' }],
  ] as const)('falls back to `sourcemaps.disable`: %j', (sourcemaps, expected) => {
    expect(resolveSourceMapsFeatures(sourcemaps)).toEqual(expected);
  });

  it.each([
    [
      { upload: true, disable: true },
      { injectDebugIds: true, upload: true },
    ],
    [
      { upload: false, disable: true },
      { injectDebugIds: true, upload: false },
    ],
    [
      { injectDebugIds: true, disable: 'disable-upload' },
      { injectDebugIds: true, upload: true },
    ],
    [
      { injectDebugIds: false, disable: false },
      { injectDebugIds: false, upload: false },
    ],
  ] as const)('ignores `sourcemaps.disable` when a new option is set: %j', (sourcemaps, expected) => {
    expect(resolveSourceMapsFeatures(sourcemaps)).toEqual(expected);
  });
});
