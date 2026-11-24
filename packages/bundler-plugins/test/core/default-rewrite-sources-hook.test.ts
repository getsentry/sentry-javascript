import type * as Path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof Path>('path');
  return { ...actual.win32, default: actual.win32 };
});

import { defaultRewriteSourcesHook } from '../../src/core/debug-id-upload';

describe('defaultRewriteSourcesHook on Windows', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('C:\\project\\dist\\assets');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns forward-slash sources for relative inputs', () => {
    expect(defaultRewriteSourcesHook('../../node_modules/nanoid/index.browser.js')).toBe(
      '../../node_modules/nanoid/index.browser.js',
    );
    expect(defaultRewriteSourcesHook('../../src/main.js')).toBe('../../src/main.js');
  });

  it('returns forward-slash sources for absolute inputs', () => {
    expect(defaultRewriteSourcesHook('C:\\project\\src\\main.js')).toBe('../../src/main.js');
  });

  it('strips the protocol from URL sources', () => {
    expect(defaultRewriteSourcesHook('webpack://my-app/src/main.js')).toBe('my-app/src/main.js');
  });
});
