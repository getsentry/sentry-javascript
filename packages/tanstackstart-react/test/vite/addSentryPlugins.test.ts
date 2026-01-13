import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSentryPlugins } from '../../src/vite/addSentryPlugins';

const mockSourceMapsPlugin: Plugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

const mockEnableSourceMapsPlugin: Plugin = {
  name: 'sentry-tanstackstart-react-source-maps',
  apply: 'build',
  enforce: 'post',
  config: vi.fn(),
};

vi.mock('../../src/vite/sourceMaps', () => ({
  makeAddSentryVitePlugin: vi.fn(() => [mockSourceMapsPlugin]),
  makeEnableSourceMapsVitePlugin: vi.fn(() => [mockEnableSourceMapsPlugin]),
}));

describe('addSentryPlugins()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('prepends Sentry plugins to the original plugins array', () => {
    const userPlugin: Plugin = { name: 'user-plugin' };
    const result = addSentryPlugins([userPlugin], {}, {});

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(mockSourceMapsPlugin);
    expect(result[1]).toBe(mockEnableSourceMapsPlugin);
    expect(result[2]).toBe(userPlugin);
  });

  it('does not add plugins in development mode', () => {
    process.env.NODE_ENV = 'development';

    const userPlugin: Plugin = { name: 'user-plugin' };
    const result = addSentryPlugins([userPlugin], {}, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(userPlugin);
  });

  it('does not add plugins when sourcemaps.disable is true', () => {
    const userPlugin: Plugin = { name: 'user-plugin' };
    const result = addSentryPlugins([userPlugin], { sourcemaps: { disable: true } }, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(userPlugin);
  });

  it('does not add plugins when sourcemaps.disable is "disable-upload"', () => {
    const userPlugin: Plugin = { name: 'user-plugin' };
    const result = addSentryPlugins([userPlugin], { sourcemaps: { disable: 'disable-upload' } }, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(userPlugin);
  });

  it('adds plugins when sourcemaps.disable is false', () => {
    const userPlugin: Plugin = { name: 'user-plugin' };
    const result = addSentryPlugins([userPlugin], { sourcemaps: { disable: false } }, {});

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(mockSourceMapsPlugin);
    expect(result[1]).toBe(mockEnableSourceMapsPlugin);
    expect(result[2]).toBe(userPlugin);
  });

  it('adds plugins by default when sourcemaps is not specified', () => {
    const userPlugin: Plugin = { name: 'user-plugin' };
    const result = addSentryPlugins([userPlugin], {}, {});

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(mockSourceMapsPlugin);
    expect(result[1]).toBe(mockEnableSourceMapsPlugin);
    expect(result[2]).toBe(userPlugin);
  });

  it('returns only Sentry plugins when no user plugins are provided', () => {
    const result = addSentryPlugins([], {}, {});

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(mockSourceMapsPlugin);
    expect(result[1]).toBe(mockEnableSourceMapsPlugin);
  });
});
