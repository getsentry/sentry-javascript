import includeAllNextjsProps, {
  includeDistDir,
  includeNextjsProps,
  PropsIncluderMapType,
} from '../../src/config/nextConfigToWebpackPluginConfig';
import { SentryWebpackPluginOptions } from '../../src/config/types';

test('includeAllNextjsProps', () => {
  expect(includeAllNextjsProps({ distDir: 'test' }, {})).toMatchObject({ include: 'test' });
});

describe('includeNextjsProps', () => {
  const includerMap: PropsIncluderMapType = {
    test: includeEverythingFn,
  };
  const includeEverything = {
    include: 'everything',
  };
  function includeEverythingFn(): Partial<SentryWebpackPluginOptions> {
    return includeEverything;
  }

  test('a prop and an includer', () => {
    expect(includeNextjsProps({ test: true }, {}, includerMap, ['test'])).toMatchObject(includeEverything);
  });

  test('a prop without includer', () => {
    expect(includeNextjsProps({ noExist: false }, {}, includerMap, ['noExist'])).toMatchObject({});
  });

  test('an includer without a prop', () => {
    expect(includeNextjsProps({ noExist: false }, {}, includerMap, ['test'])).toMatchObject({});
  });

  test('neither prop nor includer', () => {
    expect(includeNextjsProps({}, {}, {}, [])).toMatchObject({});
  });

  test('duplicated props', () => {
    let counter: number = 0;
    const mock = jest.fn().mockImplementation(() => {
      const current = counter;
      counter += 1;
      return { call: current };
    });
    const map: PropsIncluderMapType = {
      dup: mock,
    };

    expect(includeNextjsProps({}, {}, map, ['dup', 'dup'])).toMatchObject({ call: 0 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe('next config to webpack plugin config', () => {
  describe('includeDistDir', () => {
    const consoleWarnMock = jest.fn();
    const consoleErrorMock = jest.fn();

    beforeAll(() => {
      global.console.warn = consoleWarnMock;
      global.console.error = consoleErrorMock;
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
      expect(consoleWarnMock).toHaveBeenCalledTimes(1);
      consoleWarnMock.mockClear();
    });

    test.each([
      [{ distDir: 'path' }, { include: { paths: {} } }, { include: { paths: {} } }],
      [{ distDir: 'path' }, { include: { paths: { badObject: true } } }, { include: { paths: { badObject: true } } }],
    ])('webpack plugin config as object with bad structure', (nextConfig, webpackPluginConfig, expectedConfig) => {
      // @ts-ignore Bad structures don't match types
      expect(includeDistDir(nextConfig, webpackPluginConfig)).toMatchObject(expectedConfig);
      expect(consoleErrorMock).toHaveBeenCalledTimes(1);
      consoleErrorMock.mockClear();
    });
  });
});
