import { includeDistDir } from '../../src/config/nextConfigToWebpackPluginConfig';

describe('next config to webpack plugin config', () => {
  const warnMock = jest.fn();
  const errorMock = jest.fn();

  describe('includeDistDir', () => {
    beforeAll(() => {
      global.console.warn = warnMock;
      global.console.error = errorMock;
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    test.each([
      [{}, {}, {}],
      [{}, { include: 'path' }, { include: 'path' }],
      [{}, { include: [] }, { include: [] }],
      [{}, { include: ['path'] }, { include: ['path'] }],
      [{}, { include: { paths: ['path'] } }, { include: { paths: ['path'] } }],
    ])('without `distDir`', (nextConfig, webpackPluginConfig, expectedConfig) => {
      expect(includeDistDir(nextConfig, webpackPluginConfig)).toMatchObject(expectedConfig);
    });

    test.each([
      [{ distDir: 'test' }, {}, { include: 'test' }],
      [{ distDir: 'test' }, { include: 'path' }, { include: ['path', 'test'] }],
      [{ distDir: 'test' }, { include: [] }, { include: ['test'] }],
      [{ distDir: 'test' }, { include: ['path'] }, { include: ['path', 'test'] }],
      [{ distDir: 'test' }, { include: { paths: ['path'] } }, { include: { paths: ['path', 'test'] } }],
    ])('with `distDir`, different paths', (nextConfig, webpackPluginConfig, expectedConfig) => {
      expect(includeDistDir(nextConfig, webpackPluginConfig)).toMatchObject(expectedConfig);
    });

    test.each([
      [{ distDir: 'path' }, { include: 'path' }, { include: 'path' }],
      [{ distDir: 'path' }, { include: ['path'] }, { include: ['path'] }],
      [{ distDir: 'path' }, { include: { paths: ['path'] } }, { include: { paths: ['path'] } }],
    ])('with `distDir`, same path', (nextConfig, webpackPluginConfig, expectedConfig) => {
      expect(includeDistDir(nextConfig, webpackPluginConfig)).toMatchObject(expectedConfig);
    });

    test.each([
      [{ distDir: 'path' }, { include: {} }, { include: { paths: ['path'] } }],
      [{ distDir: 'path' }, { include: { prop: 'val' } }, { include: { prop: 'val', paths: ['path'] } }],
    ])('webpack plugin config as object with other prop', (nextConfig, webpackPluginConfig, expectedConfig) => {
      // @ts-ignore Other props don't match types
      expect(includeDistDir(nextConfig, webpackPluginConfig)).toMatchObject(expectedConfig);
      expect(warnMock).toHaveBeenCalledTimes(1);
      warnMock.mockClear();
    });

    test.each([
      [{ distDir: 'path' }, { include: { paths: {} } }, { include: { paths: {} } }],
      [{ distDir: 'path' }, { include: { paths: { badObject: true } } }, { include: { paths: { badObject: true } } }],
    ])('webpack plugin config as object with bad structure', (nextConfig, webpackPluginConfig, expectedConfig) => {
      // @ts-ignore Bad structures don't match types
      expect(includeDistDir(nextConfig, webpackPluginConfig)).toMatchObject(expectedConfig);
      expect(errorMock).toHaveBeenCalledTimes(1);
      errorMock.mockClear();
    });
  });
});
